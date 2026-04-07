export type AudioCaptureHandle = {
  sampleRate: number;
  tabAudioEnabled: boolean;
  stop: () => void;
};

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

type StartAudioCaptureOptions = {
  includeTabAudio: boolean;
  deviceId?: string;
  onChunk: (pcmBase64: string, sampleRate: number) => void;
  onLevel?: (level: number) => void;
  onSpeechPause?: () => void;
  onDebug?: (diagnostics: {
    rms: number;
    peak: number;
    gateOpen: boolean;
    openThreshold: number;
    closeThreshold: number;
    candidateChunks: number;
    sentChunks: number;
    droppedChunks: number;
  }) => void;
};

type BufferedChunk = {
  pcmBase64: string;
  sampleRate: number;
};

type AudioGateMessage =
  | {
      type: "level";
      level: number;
    }
  | {
      type: "chunk";
      pcmBuffer: ArrayBuffer;
      sampleRate: number;
    }
  | {
      type: "speech_pause";
    }
  | {
      type: "debug";
      rms: number;
      peak: number;
      gateOpen: boolean;
      openThreshold: number;
      closeThreshold: number;
      candidateChunks: number;
      sentChunks: number;
      droppedChunks: number;
    };

export async function startAudioCapture(
  options: StartAudioCaptureOptions
): Promise<AudioCaptureHandle> {
  const mediaDevices = navigator.mediaDevices;

  if (!mediaDevices || !mediaDevices.getUserMedia) {
    throw new Error(
      "Microphone capture is unavailable on this page. Open RealtimeBuddy on http://localhost:3000 and allow microphone access."
    );
  }

  const displayStream =
    options.includeTabAudio && mediaDevices.getDisplayMedia
      ? await mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
      : null;

  const micStream = await mediaDevices.getUserMedia({
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
  });

  const tabAudioEnabled = Boolean(displayStream?.getAudioTracks()[0]);
  const audioContext = new AudioContext({
    sampleRate: 48_000,
  });
  void audioContext.resume();
  await audioContext.audioWorklet.addModule("/audio-gate-processor.js");

  const mixer = audioContext.createGain();
  const processor = new AudioWorkletNode(audioContext, "audio-gate-processor", {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const highPass = audioContext.createBiquadFilter();
  const lowPass = audioContext.createBiquadFilter();
  const compressor = audioContext.createDynamicsCompressor();
  const speechGain = audioContext.createGain();

  highPass.type = "highpass";
  highPass.frequency.value = 140;
  highPass.Q.value = 0.7;

  lowPass.type = "lowpass";
  lowPass.frequency.value = 4200;
  lowPass.Q.value = 0.7;

  compressor.threshold.value = -24;
  compressor.knee.value = 20;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  speechGain.gain.value = 1.8;

  const micSource = audioContext.createMediaStreamSource(micStream);
  micSource.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(compressor);
  compressor.connect(speechGain);
  speechGain.connect(mixer);

  let displaySource: MediaStreamAudioSourceNode | null = null;
  if (tabAudioEnabled && displayStream) {
    const audioOnlyDisplayStream = new MediaStream(displayStream.getAudioTracks());
    displaySource = audioContext.createMediaStreamSource(audioOnlyDisplayStream);
    displaySource.connect(mixer);
  }

  mixer.connect(processor);
  processor.port.onmessage = (event: MessageEvent<AudioGateMessage>) => {
    const message = event.data;

    if (message.type === "level") {
      options.onLevel?.(message.level);
      return;
    }

    if (message.type === "chunk") {
      const pcm = new Int16Array(message.pcmBuffer);
      const chunk: BufferedChunk = {
        pcmBase64: int16ToBase64Pcm16(pcm),
        sampleRate: message.sampleRate,
      };
      options.onChunk(chunk.pcmBase64, chunk.sampleRate);
      return;
    }

    if (message.type === "debug") {
      options.onDebug?.({
        rms: message.rms,
        peak: message.peak,
        gateOpen: message.gateOpen,
        openThreshold: message.openThreshold,
        closeThreshold: message.closeThreshold,
        candidateChunks: message.candidateChunks,
        sentChunks: message.sentChunks,
        droppedChunks: message.droppedChunks,
      });
      return;
    }

    options.onSpeechPause?.();
  };

  return {
    sampleRate: audioContext.sampleRate,
    tabAudioEnabled,
    stop() {
      processor.disconnect();
      mixer.disconnect();
      compressor.disconnect();
      speechGain.disconnect();
      lowPass.disconnect();
      highPass.disconnect();
      micSource.disconnect();
      displaySource?.disconnect();

      for (const track of micStream.getTracks()) {
        track.stop();
      }

      for (const track of displayStream?.getTracks() ?? []) {
        track.stop();
      }

      void audioContext.close();
    },
  };
}

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  const mediaDevices = navigator.mediaDevices;

  if (!mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await mediaDevices.enumerateDevices();
  let microphoneIndex = 0;

  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device) => {
      microphoneIndex += 1;

      return {
        deviceId: device.deviceId,
        label: device.label || `Microphone ${microphoneIndex}`,
      };
    });
}

function int16ToBase64Pcm16(samples: Int16Array) {
  const bytes = new Uint8Array(samples.buffer.slice(0));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}
