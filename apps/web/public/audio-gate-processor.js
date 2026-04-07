const CHUNK_SIZE = 2048;
const GATE_OPEN_THRESHOLD = 0.028;
const GATE_CLOSE_THRESHOLD = 0.018;
const GATE_PREBUFFER_CHUNKS = 4;
const GATE_HANGOVER_CHUNKS = 12;
const GATE_OPEN_CONSECUTIVE_CHUNKS = 3;

class AudioGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pendingSamples = [];
    this.prebuffer = [];
    this.gateOpen = false;
    this.gateHangover = 0;
    this.gateOpenCandidateChunks = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const channelCount = input.length;
    const sampleCount = input[0].length;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      let sample = 0;
      for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
        sample += input[channelIndex][sampleIndex];
      }

      this.pendingSamples.push(sample / channelCount);
    }

    while (this.pendingSamples.length >= CHUNK_SIZE) {
      const monoChunk = this.pendingSamples.splice(0, CHUNK_SIZE);
      this.handleChunk(monoChunk);
    }

    return true;
  }

  handleChunk(monoChunk) {
    let energy = 0;
    const pcmChunk = new Int16Array(monoChunk.length);

    for (let index = 0; index < monoChunk.length; index += 1) {
      const sample = monoChunk[index];
      energy += sample * sample;
      const clipped = Math.max(-1, Math.min(1, sample));
      const value = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      pcmChunk[index] = value;
    }

    const rms = Math.sqrt(energy / monoChunk.length);
    this.port.postMessage({
      type: "level",
      level: Math.min(1, rms * 8),
    });

    if (!this.gateOpen) {
      this.prebuffer.push(pcmChunk);
      if (this.prebuffer.length > GATE_PREBUFFER_CHUNKS) {
        this.prebuffer.shift();
      }

      if (rms >= GATE_OPEN_THRESHOLD) {
        this.gateOpenCandidateChunks += 1;
      } else {
        this.gateOpenCandidateChunks = 0;
      }

      if (this.gateOpenCandidateChunks >= GATE_OPEN_CONSECUTIVE_CHUNKS) {
        this.gateOpen = true;
        this.gateHangover = GATE_HANGOVER_CHUNKS;
        this.gateOpenCandidateChunks = 0;

        for (const bufferedChunk of this.prebuffer) {
          this.port.postMessage(
            {
              type: "chunk",
              pcmBuffer: bufferedChunk.buffer,
              sampleRate,
            },
            [bufferedChunk.buffer]
          );
        }

        this.prebuffer.length = 0;
      }

      return;
    }

    this.port.postMessage(
      {
        type: "chunk",
        pcmBuffer: pcmChunk.buffer,
        sampleRate,
      },
      [pcmChunk.buffer]
    );

    if (rms >= GATE_CLOSE_THRESHOLD) {
      this.gateHangover = GATE_HANGOVER_CHUNKS;
      return;
    }

    this.gateHangover -= 1;
    if (this.gateHangover <= 0) {
      this.gateOpen = false;
      this.prebuffer.length = 0;
      this.port.postMessage({
        type: "speech_pause",
      });
    }
  }
}

registerProcessor("audio-gate-processor", AudioGateProcessor);
