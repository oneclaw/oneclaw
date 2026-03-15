// sherpa-onnx-node 和 naudiodon2 没有 TypeScript 类型声明
// 我们在 speech-engine.ts 中使用自定义接口包装，这里只做模块声明

declare module "sherpa-onnx-node" {
  export class OnlineStream {
    acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void;
    inputFinished(): void;
  }

  export class OnlineRecognizer {
    constructor(config: Record<string, unknown>);
    createStream(): OnlineStream;
    isReady(stream: OnlineStream): boolean;
    decode(stream: OnlineStream): void;
    isEndpoint(stream: OnlineStream): boolean;
    reset(stream: OnlineStream): void;
    getResult(stream: OnlineStream): { text: string; tokens: string[] };
  }

  export class OfflineRecognizer {
    constructor(config: Record<string, unknown>);
  }

  export class OfflineTts {
    constructor(config: Record<string, unknown>);
    numSpeakers: number;
    sampleRate: number;
    generate(obj: {
      text: string;
      sid: number;
      speed: number;
    }): { samples: Float32Array; sampleRate: number };
    generateAsync(obj: {
      text: string;
      sid: number;
      speed: number;
    }): Promise<{ samples: Float32Array; sampleRate: number }>;
  }

  export class Vad {
    constructor(config: Record<string, unknown>, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    pop(): void;
    clear(): void;
    front(
      enableExternalBuffer?: boolean,
    ): { start: number; samples: Float32Array };
    reset(): void;
    flush(): void;
  }

  export class CircularBuffer {
    constructor(capacity: number);
    push(samples: Float32Array): void;
    get(
      startIndex: number,
      n: number,
      enableExternalBuffer?: boolean,
    ): Float32Array;
    pop(n: number): void;
    size(): number;
    head(): number;
    reset(): void;
  }

  export function readWave(
    path: string,
  ): { samples: Float32Array; sampleRate: number };
  export function writeWave(
    path: string,
    obj: { samples: Float32Array; sampleRate: number },
  ): void;

  export const version: string;
  export const gitSha1: string;
  export const gitDate: string;
}

declare module "naudiodon2" {
  export class AudioIO {
    constructor(opts: {
      inOptions?: {
        channelCount: number;
        sampleFormat: number;
        sampleRate: number;
        deviceId: number;
        closeOnError: boolean;
      };
      outOptions?: {
        channelCount: number;
        sampleFormat: number;
        sampleRate: number;
        deviceId: number;
        closeOnError: boolean;
      };
    });
    start(): void;
    quit(): void;
    on(event: "data", cb: (buf: Buffer) => void): void;
    on(event: "error", cb: (err: Error) => void): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
    pipe(destination: NodeJS.WritableStream): NodeJS.WritableStream;
  }

  export const SampleFormat16Bit: number;
  export const SampleFormatFloat32: number;
  export const SampleFormat24Bit: number;
  export const SampleFormat8Bit: number;

  export function getDevices(): Array<{
    id: number;
    name: string;
    maxInputChannels: number;
    maxOutputChannels: number;
    defaultSampleRate: number;
    defaultLowInputLatency: number;
    defaultLowOutputLatency: number;
    defaultHighInputLatency: number;
    defaultHighOutputLatency: number;
    hostAPIName: string;
  }>;

  export function getHostAPIs(): {
    defaultHostAPI: number;
    HostAPIs: Array<{
      id: number;
      name: string;
      deviceCount: number;
      defaultInput: number;
      defaultOutput: number;
    }>;
  };
}
