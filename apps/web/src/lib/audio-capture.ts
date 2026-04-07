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
};

type BufferedChunk = {
  pcmBase64: string;
  sampleRate: number;
};

const GATE_OPEN_THRESHOLD = 0.028;
const GATE_CLOSE_THRESHOLD = 0.018;
const GATE_PREBUFFER_CHUNKS = 4;
const GATE_HANGOVER_CHUNKS = 12;
const GATE_OPEN_CONSECUTIVE_CHUNKS = 3;

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

  const mixer = audioContext.createGain();
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silence = audioContext.createGain();
  const highPass = audioContext.createBiquadFilter();
  const lowPass = audioContext.createBiquadFilter();
  const compressor = audioContext.createDynamicsCompressor();
  silence.gain.value = 0;
  const prebuffer: BufferedChunk[] = [];
  let gateOpen = false;
  let gateHangover = 0;
  let gateOpenCandidateChunks = 0;

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

  const micSource = audioContext.createMediaStreamSource(micStream);
  micSource.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(compressor);
  compressor.connect(mixer);

  let displaySource: MediaStreamAudioSourceNode | null = null;
  if (tabAudioEnabled && displayStream) {
    const audioOnlyDisplayStream = new MediaStream(displayStream.getAudioTracks());
    displaySource = audioContext.createMediaStreamSource(audioOnlyDisplayStream);
    displaySource.connect(mixer);
  }

  mixer.connect(processor);
  processor.connect(silence);
  silence.connect(audioContext.destination);

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer;
    const channelCount = input.numberOfChannels;
    const sampleCount = input.length;
    const mono = new Float32Array(sampleCount);
    let energy = 0;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      let sample = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        sample += input.getChannelData(channelIndex)[sampleIndex];
      }
      const monoSample = sample / channelCount;
      mono[sampleIndex] = monoSample;
      energy += monoSample * monoSample;
    }

    const rms = Math.sqrt(energy / sampleCount);
    const chunk = {
      pcmBase64: float32ToBase64Pcm16(mono),
      sampleRate: audioContext.sampleRate,
    };

    options.onLevel?.(Math.min(1, rms * 8));

    if (!gateOpen) {
      prebuffer.push(chunk);
      if (prebuffer.length > GATE_PREBUFFER_CHUNKS) {
        prebuffer.shift();
      }

      if (rms >= GATE_OPEN_THRESHOLD) {
        gateOpenCandidateChunks += 1;
      } else {
        gateOpenCandidateChunks = 0;
      }

      if (gateOpenCandidateChunks >= GATE_OPEN_CONSECUTIVE_CHUNKS) {
        gateOpen = true;
        gateHangover = GATE_HANGOVER_CHUNKS;
        gateOpenCandidateChunks = 0;

        for (const bufferedChunk of prebuffer) {
          options.onChunk(bufferedChunk.pcmBase64, bufferedChunk.sampleRate);
        }

        prebuffer.length = 0;
      }

      return;
    }

    options.onChunk(chunk.pcmBase64, chunk.sampleRate);

    if (rms >= GATE_CLOSE_THRESHOLD) {
      gateHangover = GATE_HANGOVER_CHUNKS;
      return;
    }

    gateHangover -= 1;
    if (gateHangover <= 0) {
      gateOpen = false;
      prebuffer.length = 0;
      options.onSpeechPause?.();
    }
  };

  return {
    sampleRate: audioContext.sampleRate,
    tabAudioEnabled,
    stop() {
      processor.disconnect();
      mixer.disconnect();
      silence.disconnect();
      compressor.disconnect();
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

function float32ToBase64Pcm16(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[index]));
    const value = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    view.setInt16(index * 2, value, true);
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}
