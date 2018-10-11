import React, { Component } from 'react';
import PropTypes from 'prop-types';

import SwfFlashFile from './jscam_canvas_only.swf';

const HAS_USER_MEDIA = !!(
  (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.msGetUserMedia
);
const FLASH_OBJECT_ID = 'XwebcamXobjectX';
const isIE = !!navigator.userAgent.match(/Trident/g) || !!navigator.userAgent.match(/MSIE/g);

const constrainStringType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.arrayOf(PropTypes.string),
  PropTypes.shape({
    exact: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.arrayOf(PropTypes.string),
    ]),
  }),
  PropTypes.shape({
    ideal: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.arrayOf(PropTypes.string),
    ]),
  }),
]);

const constrainBooleanType = PropTypes.oneOfType([
  PropTypes.shape({
    exact: PropTypes.bool,
  }),
  PropTypes.shape({
    ideal: PropTypes.bool,
  }),
]);

const constrainLongType = PropTypes.oneOfType([
  PropTypes.number,
  PropTypes.shape({
    exact: PropTypes.number,
    ideal: PropTypes.number,
    min: PropTypes.number,
    max: PropTypes.number,
  }),
]);

const constrainDoubleType = constrainLongType;

const audioConstraintType = PropTypes.shape({
  deviceId: constrainStringType,
  groupId: constrainStringType,
  autoGainControl: constrainBooleanType,
  channelCount: constrainLongType,
  latency: constrainDoubleType,
  noiseSuppression: constrainBooleanType,
  sampleRate: constrainLongType,
  sampleSize: constrainLongType,
  volume: constrainDoubleType,
});

const videoConstraintType = PropTypes.shape({
  deviceId: constrainStringType,
  groupId: constrainStringType,
  aspectRatio: constrainDoubleType,
  facingMode: constrainStringType,
  frameRate: constrainDoubleType,
  height: constrainLongType,
  width: constrainLongType,
});

export default class Webcam extends Component {
  static defaultProps = {
    audio: true,
    className: '',
    height: 480,
    onSuccess: () => {},
    onError: () => {},
    screenshotFormat: 'image/webp',
    width: 640,
    screenshotQuality: 0.92,
  };

  static propTypes = {
    audio: PropTypes.bool,
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    screenshotFormat: PropTypes.oneOf([
      'image/webp',
      'image/png',
      'image/jpeg',
    ]),
    style: PropTypes.object,
    className: PropTypes.string,
    screenshotQuality: PropTypes.number,
    screenshotWidth: PropTypes.number,
    audioConstraints: audioConstraintType,
    videoConstraints: videoConstraintType,
  };

  static mountedInstances = [];

  static userMediaRequested = false;

  constructor() {
    super();
    this.state = {
      hasUserMedia: false,
    };
    this.pos = 0;
  }

  componentDidMount() {
    Webcam.mountedInstances.push(this);

    if (!this.state.hasUserMedia && !Webcam.userMediaRequested) {
      if (HAS_USER_MEDIA) {
        this.requestUserMedia();
      } else {
        this.requestFlashFallback();
      }
    }
  }

  componentWillUpdate(nextProps) {
    if (
      HAS_USER_MEDIA && (JSON.stringify(nextProps.audioConstraints) !==
      JSON.stringify(this.props.audioConstraints) ||
      JSON.stringify(nextProps.videoConstraints) !==
      JSON.stringify(this.props.videoConstraints))
    ) {
      this.requestUserMedia();
    }
  }

  componentWillUnmount() {
    const index = Webcam.mountedInstances.indexOf(this);
    Webcam.mountedInstances.splice(index, 1);

    Webcam.userMediaRequested = false;
    if (HAS_USER_MEDIA && this.state.hasUserMedia) {
      if (Webcam.mountedInstances.length === 0) {
        if (this.stream.getVideoTracks && this.stream.getAudioTracks) {
          this.stream.getVideoTracks().map(track => track.stop());
          this.stream.getAudioTracks().map(track => track.stop());
        } else {
          this.stream.stop();
        }
        window.URL.revokeObjectURL(this.state.src);
      } else {
        delete window.webcam;
      }
    }
  }

  getScreenshot() {
    if (!this.state.hasUserMedia) return null;

    const canvas = this.getCanvas();

    return (
      canvas &&
      canvas.toDataURL(
        this.props.screenshotFormat,
        this.props.screenshotQuality,
      )
    );
  }

  getCanvas() {
    if (!this.state.hasUserMedia || (HAS_USER_MEDIA && !this.video.videoHeight)) return null;

    let width;
    let height;
    let canvasWidth;
    let canvasHeight;
    if (HAS_USER_MEDIA) {
      width = this.video.videoWidth;
      height = this.video.videoHeight;
      canvasWidth = this.props.screenshotWidth || this.video.clientWidth;
      const aspectRatio = width / height;
      canvasHeight = canvasWidth / aspectRatio;
    } else {
      width = this.props.width;
      height = this.props.height;
      canvasWidth = this.props.screenshotWidth || width;
      canvasHeight = this.props.height;
    }

    if (!this.ctx) {
      const canvas = document.createElement('canvas');

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }

    const { ctx, canvas } = this;

    if (HAS_USER_MEDIA) {
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    } else {
      this.ctx.clearRect(0, 0, width, height);
      this.image = this.ctx.getImageData(0, 0, width, height);
      this.captureFlashStream();
    }

    return canvas;
  }

  requestFlashFallback() {
    window.webcam = {
      onCapture: () => {
        this.saveFlashStream();
      },
      onSave: (data) => {
        const col = data.split(';');
        const { width, height } = this.props;

        let tmp = null;
        for (let i = 0; i < width; i += 1) {
          tmp = parseInt(col[i], 10);
          /* eslint-disable */
          this.image.data[this.pos + 0] = (tmp >> 16) & 0xff;
          this.image.data[this.pos + 1] = (tmp >> 8) & 0xff;
          this.image.data[this.pos + 2] = tmp & 0xff;
          this.image.data[this.pos + 3] = 0xff;
          /* eslint-enable */
          this.pos += 4;
        }

        if (this.pos >= 4 * width * height) {
          this.ctx.putImageData(this.image, 0, 0);
          this.pos = 0;
        }
      },
    };

    const self = this;

    (function register(run) {
      const cam = document.getElementById(FLASH_OBJECT_ID);

      if (cam.capture !== undefined) {
        self.captureFlashStream = () => {
          try {
            return cam.capture(0);
          } catch (e) {
            self.props.onError();
          }

          return null;
        };

        self.saveFlashStream = () => {
          try {
            return cam.save(0);
          } catch (e) {
            self.props.onError();
          }

          return null;
        };

        self.setState({ hasUserMedia: true });
        self.props.onSuccess();
      } else if (run === 0) {
        self.props.onError('Flash interface was not found');
      } else {
        // Flash interface not ready yet
        window.setTimeout(register, 1000 * (4 - run), run - 1);
      }
    }(3));

    Webcam.userMediaRequested = true;
  }

  requestUserMedia() {
    navigator.getUserMedia =
      navigator.mediaDevices.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    const sourceSelected = (audioConstraints, videoConstraints) => {
      const constraints = {
        video: videoConstraints || true,
      };

      if (this.props.audio) {
        constraints.audio = audioConstraints || true;
      }

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          Webcam.mountedInstances.forEach(instance =>
            instance.handleUserMedia(null, stream),
          );
        })
        .catch((e) => {
          Webcam.mountedInstances.forEach(instance =>
            instance.handleUserMedia(e),
          );
        });
    };

    if ('mediaDevices' in navigator) {
      sourceSelected(this.props.audioConstraints, this.props.videoConstraints);
    } else {
      const optionalSource = id => ({ optional: [{ sourceId: id }] });

      const constraintToSourceId = (constraint) => {
        const deviceId = (constraint || {}).deviceId;

        if (typeof deviceId === 'string') {
          return deviceId;
        } else if (Array.isArray(deviceId) && deviceId.length > 0) {
          return deviceId[0];
        } else if (typeof deviceId === 'object' && deviceId.ideal) {
          return deviceId.ideal;
        }

        return null;
      };

      MediaStreamTrack.getSources((sources) => {
        let audioSource = null;
        let videoSource = null;

        sources.forEach((source) => {
          if (source.kind === 'audio') {
            audioSource = source.id;
          } else if (source.kind === 'video') {
            videoSource = source.id;
          }
        });

        const audioSourceId = constraintToSourceId(this.props.audioConstraints);
        if (audioSourceId) {
          audioSource = audioSourceId;
        }

        const videoSourceId = constraintToSourceId(this.props.videoConstraints);
        if (videoSourceId) {
          videoSource = videoSourceId;
        }

        sourceSelected(
          optionalSource(audioSource),
          optionalSource(videoSource),
        );
      });
    }

    Webcam.userMediaRequested = true;
  }

  handleUserMedia(err, stream) {
    if (err) {
      this.setState({ hasUserMedia: false });
      this.props.onError(err);

      return;
    }

    this.stream = stream;

    try {
      this.video.srcObject = stream;
      this.setState({ hasUserMedia: true });
    } catch (error) {
      this.setState({
        hasUserMedia: true,
        src: window.URL.createObjectURL(stream),
      });
    }

    this.props.onSuccess();
  }

  render() {
    if (!HAS_USER_MEDIA) {
      const browserSpecificAttrs = {};

      if (isIE) {
        browserSpecificAttrs.classID = 'clsid:D27CDB6E-AE6D-11cf-96B8-444553540000';
      } else {
        browserSpecificAttrs.type = 'application/x-shockwave-flash';
        browserSpecificAttrs.data = SwfFlashFile;
      }

      return (
        <object
          id={FLASH_OBJECT_ID}
          {...browserSpecificAttrs}
          width={this.props.width}
          height={this.props.height}
        >
          {isIE && <param name="movie" value={SwfFlashFile} />}
          <param name="FlashVars" value="mode=callback&amp;quality=85" />
          <param name="allowScriptAccess" value="always" />
        </object>
      );
    }

    return (
      <video
        autoPlay
        width={this.props.width}
        height={this.props.height}
        src={this.state.src}
        muted={this.props.audio}
        className={this.props.className}
        playsInline
        style={this.props.style}
        ref={(ref) => {
          this.video = ref;
        }}
      />
    );
  }
}
