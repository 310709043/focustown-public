"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/api/client";
import { tracksApi } from "@/lib/api/endpoints";
import type { Track } from "@/lib/api/types.gen";
import { MOOD_KEYS, type MoodKey } from "./MoodTabs";

type Props = {
  onUploaded: (track: Track) => void;
  disabled?: boolean;
};

const SELECTABLE_MOODS: ReadonlyArray<MoodKey> = MOOD_KEYS.filter((k) => k !== "all");

const KNOWN_ERROR_CODES = new Set([
  "track_quota_exceeded",
  "file_too_large",
  "empty_file",
  "not_an_mp3",
  "unsupported_media_type",
  "unauthorized",
]);

export function UploadForm({ onUploaded, disabled }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState<MoodKey>("lofi");
  const [artist, setArtist] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const t = useTranslations("library.upload");
  const tMood = useTranslations("library.moods");
  const tErr = useTranslations("library.upload.errors");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError(tErr("file_missing"));
      return;
    }
    if (!title.trim()) {
      setError(tErr("title_missing"));
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
      setOk(t("successMessage", { title: track.title }));
      setTitle("");
      setArtist("");
      setFile(null);
      // Reset native file input
      const input = document.getElementById("track-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "request_failed";
      const key = KNOWN_ERROR_CODES.has(code) ? code : "request_failed";
      setError(tErr(key));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border border-border rounded p-3"
    >
      <div className="text-xs text-muted">{t("title")}</div>

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
          placeholder={t("titlePlaceholder")}
          className="text-xs px-2 py-1 bg-bg border border-border rounded"
          maxLength={255}
          disabled={disabled || submitting}
        />
        <input
          type="text"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder={t("artistPlaceholder")}
          className="text-xs px-2 py-1 bg-bg border border-border rounded"
          maxLength={255}
          disabled={disabled || submitting}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted">{t("moodLabel")}</span>
        <select
          value={mood}
          onChange={(e) => setMood(e.target.value as MoodKey)}
          className="text-xs px-2 py-1 bg-bg border border-border rounded"
          disabled={disabled || submitting}
        >
          {SELECTABLE_MOODS.map((k) => (
            <option key={k} value={k}>
              {tMood(k)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={disabled || submitting || !file || !title.trim()}
        className="self-start text-xs px-3 py-1 rounded border border-accent-1 text-accent-1 hover:bg-accent-1/10 disabled:opacity-50"
      >
        {submitting ? t("uploadingCta") : t("submitCta")}
      </button>

      {error && <div className="text-[11px] text-red-400">{error}</div>}
      {ok && <div className="text-[11px] text-accent-1">{ok}</div>}
    </form>
  );
}
