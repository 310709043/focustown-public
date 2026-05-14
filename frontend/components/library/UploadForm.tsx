"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";
import { MOODS } from "./MoodTabs";

type Props = {
  onUploaded: (track: Track) => void;
  disabled?: boolean;
};

const SELECTABLE_MOODS = MOODS.filter((m) => m.key !== "all");

const ERROR_LABELS: Record<string, string> = {
  track_quota_exceeded: "已達 10 首上限，請先刪除一些舊的",
  file_too_large: "檔案過大（上限 15 MB）",
  empty_file: "選到空檔案",
  not_an_mp3: "只接受 MP3 (前 4 bytes 看起來不是 MP3 header)",
  unsupported_media_type: "只接受 audio/mpeg",
  unauthorized: "請先登入再上傳",
};

export function UploadForm({ onUploaded, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState<string>("lofi");
  const [artist, setArtist] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("請選擇一個 MP3 檔案");
      return;
    }
    if (!title.trim()) {
      setError("請輸入歌曲標題");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOk(null);
    try {
      const track = await tracksApi.upload({
        file,
        title: title.trim(),
        mood,
        artist: artist.trim() || undefined,
      });
      onUploaded(track);
      setOk(`✓ 已上傳「${track.title}」`);
      setTitle("");
      setArtist("");
      setFile(null);
      // Reset native file input
      const input = document.getElementById("track-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "request_failed";
      setError(ERROR_LABELS[code] ?? (e instanceof Error ? e.message : "upload_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border border-border rounded p-3"
    >
      <div className="text-xs text-muted">上傳新曲（最多 10 首 · 15 MB / 首）</div>

      <input
        id="track-file-input"
        type="file"
        accept="audio/mpeg,.mp3"
        onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
        className="text-xs"
        disabled={disabled || submitting}
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="標題"
          className="text-xs px-2 py-1 bg-bg border border-border rounded"
          maxLength={255}
          disabled={disabled || submitting}
        />
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="演出者 (選填)"
          className="text-xs px-2 py-1 bg-bg border border-border rounded"
          maxLength={255}
          disabled={disabled || submitting}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted">mood</span>
        <select
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          className="text-xs px-2 py-1 bg-bg border border-border rounded"
          disabled={disabled || submitting}
        >
          {SELECTABLE_MOODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={disabled || submitting || !file || !title.trim()}
        className="self-start text-xs px-3 py-1 rounded border border-accent-1 text-accent-1 hover:bg-accent-1/10 disabled:opacity-50"
      >
        {submitting ? "上傳中…" : "上傳"}
      </button>

      {error && <div className="text-[11px] text-red-400">{error}</div>}
      {ok && <div className="text-[11px] text-accent-1">{ok}</div>}
    </form>
  );
}
