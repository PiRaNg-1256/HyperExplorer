import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  File,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';

const EXT_MAP: Record<string, LucideIcon> = {
  // Images
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
  webp: FileImage, bmp: FileImage, ico: FileImage, svg: FileImage, avif: FileImage,
  // Video
  mp4: FileVideo, mkv: FileVideo, avi: FileVideo, mov: FileVideo, webm: FileVideo,
  // Audio
  mp3: FileAudio, wav: FileAudio, flac: FileAudio, aac: FileAudio, ogg: FileAudio,
  // Code
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode, rs: FileCode,
  py: FileCode, go: FileCode, java: FileCode, cpp: FileCode, c: FileCode,
  cs: FileCode, html: FileCode, css: FileCode, json: FileCode, yaml: FileCode,
  toml: FileCode, xml: FileCode, sh: FileCode, bat: FileCode, ps1: FileCode,
  // Documents
  txt: FileText, md: FileText, pdf: FileText, doc: FileText, docx: FileText,
  rtf: FileText,
  // Spreadsheets
  xlsx: FileSpreadsheet, xls: FileSpreadsheet, csv: FileSpreadsheet,
  // Archives
  zip: FileArchive, rar: FileArchive, gz: FileArchive, tar: FileArchive,
  '7z': FileArchive, bz2: FileArchive, xz: FileArchive,
};

const EXT_COLORS: Record<string, string> = {
  // Images — green
  png: 'text-emerald-400', jpg: 'text-emerald-400', jpeg: 'text-emerald-400',
  gif: 'text-emerald-400', svg: 'text-emerald-400', webp: 'text-emerald-400',
  // Video — purple
  mp4: 'text-purple-400', mkv: 'text-purple-400', avi: 'text-purple-400',
  // Audio — pink
  mp3: 'text-pink-400', wav: 'text-pink-400', flac: 'text-pink-400',
  // Code — blue
  ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400',
  jsx: 'text-yellow-400', rs: 'text-orange-400', py: 'text-blue-300',
  // Archives — amber
  zip: 'text-amber-400', rar: 'text-amber-400', gz: 'text-amber-400',
  // Docs — zinc
  pdf: 'text-red-400', md: 'text-zinc-300',
};

interface Props {
  isDir: boolean;
  extension: string;
  size?: number;
}

export function FileIcon({ isDir, extension, size = 15 }: Props) {
  if (isDir) {
    return <Folder size={size} className="text-[#6366f1] shrink-0" />;
  }
  const Icon = EXT_MAP[extension] ?? File;
  const color = EXT_COLORS[extension] ?? 'text-zinc-400';
  return <Icon size={size} className={`${color} shrink-0`} />;
}
