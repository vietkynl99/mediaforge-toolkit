export type VaultFileType = 'video' | 'audio' | 'subtitle' | 'image' | 'output' | 'other';
export type VaultStatus = 'raw' | 'partial' | 'complete' | 'error' | 'processing';

export interface VaultFile {
  id: string;
  name: string;
  type: VaultFileType;
  size: string;
  sizeBytes?: number;
  duration?: string;
  durationSeconds?: number;
  language?: string;
  linkedTo?: string;
  linkedToPath?: string;
  origin?: 'source' | 'vr' | 'tts';
  progress?: number;
  version?: string;
  resolution?: string;
  relativePath?: string;
  status?: VaultStatus;
  createdAt?: string;
  updatedAt?: string;
  uvr?: {
    processedAt: string;
    backend?: string;
    model?: string;
    outputFormat?: string;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
  tts?: {
    processedAt: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    overlapSeconds?: number;
    overlapMode?: 'overlap' | 'truncate';
    removeLineBreaks?: boolean;
    outputSignature?: string;
    outputDetails?: Record<
      string,
      {
        processedAt?: string;
        voice?: string;
        rate?: number;
        pitch?: number;
        volume?: number;
        overlapSeconds?: number;
        overlapMode?: 'overlap' | 'truncate';
        removeLineBreaks?: boolean;
        outputSignature?: string;
      }
    >;
    outputs?: string[];
    role?: 'source' | 'output';
    sourceRelativePath?: string;
  };
}

export interface VaultFolder {
  id: string;
  name: string;
  status?: VaultStatus;
  lastActivity?: string;
  tags?: string[];
  suggestedAction?: string;
  path?: string;
  files: VaultFile[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VaultFileDTO {
  id?: string;
  name: string;
  relativePath: string;
  size?: string;
  sizeBytes: number;
  duration?: string;
  modifiedAt?: string;
  updatedAt?: string;
  type: VaultFileType;
  extension?: string;
  durationSeconds?: number;
  resolution?: string;
  linkedTo?: string;
  uvr?: VaultFile['uvr'];
  tts?: VaultFile['tts'];
}

export interface VaultFolderDTO {
  id?: string;
  name: string;
  path: string;
  updatedAt?: string;
  files: VaultFileDTO[];
}
