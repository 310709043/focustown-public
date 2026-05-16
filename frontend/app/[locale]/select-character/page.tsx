"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { userApi } from "@/lib/api/endpoints";
import { AVATARS } from "@/lib/pixel/sprites/avatars";
import { avatarIdToCharacterKey } from "@/lib/data/character-mapping";
import { type DailyGoal } from "@/lib/data/profileOptions";

import { AgeSlider } from "@/components/select-character/AgeSlider";
import { DailyGoalRadio } from "@/components/select-character/DailyGoalRadio";
import { InterestChips } from "@/components/select-character/InterestChips";
import { NicknameField } from "@/components/select-character/NicknameField";
import { PreviewCard } from "@/components/select-character/PreviewCard";
import { RegionSelect } from "@/components/select-character/RegionSelect";
import { RoleGrid } from "@/components/select-character/RoleGrid";
import { SectionLabel } from "@/components/select-character/SectionLabel";
import { SelectCharacterScene } from "@/components/select-character/SelectCharacterScene";
import { SkillChips } from "@/components/select-character/SkillChips";
import { SummaryFooter } from "@/components/select-character/SummaryFooter";
import { TabBar, type TabKey } from "@/components/select-character/TabBar";

function useTransientToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, show: setMsg };
}

/**
 * /select-character — Page 2 of the focustwon/reference UI sync.
 *
 * Visual layout matches `reference/screen-character.jsx` 1:1:
 *  • 50 px top bar (back / step / dots / FOCUSTOWN wordmark)
 *  • Left column (380 px): live preview card + form panel
 *      (nickname, age slider, region dropdown, daily-goal radio)
 *  • Right column (flex 1): tab bar (role / interests / skills / all)
 *      + sectioned scrollable grids
 *  • Summary footer (role · interests · skills + ✦ enter town CTA)
 *
 * Routing + state + backend integration follow Current's conventions:
 *  • `userApi.updateMe` still receives only `character_key /
 *    display_name / role_label` — the other fields (age, region,
 *    interests, skills, goal) ride a future profile-schema upgrade
 *    and are kept in local state for the visual port.
 *  • `useAuthStore.hydrate` after save, then `router.push("/town")`.
 */
export default function SelectCharacterPage() {
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const t = useTranslations("characters.selectPage");
  const { msg, show } = useTransientToast();

  // Defaults align with reference seed values for a friendlier first render.
  const [selectedAvatar, setSelectedAvatar] = useState<string>(AVATARS[0].id);
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState(27);
  const [region, setRegion] = useState("TW-TPE");
  const [interests, setInterests] = useState<string[]>(["coding", "lofi", "tea"]);
  const [skills, setSkills] = useState<string[]>(["frontend", "design"]);
  const [goal, setGoal] = useState<DailyGoal>(4);
  const [tab, setTab] = useState<TabKey>("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    if (user?.display_name) setNickname(user.display_name);
  }, [user]);

  const avatar = useMemo(
    () => AVATARS.find((a) => a.id === selectedAvatar) ?? AVATARS[0],
    [selectedAvatar],
  );

  const toggleIn = (list: string[], setList: (next: string[]) => void) => (key: string) =>
    setList(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

  const onConfirm = async () => {
    if (!nickname.trim()) {
      show(t("toastPickFirst"));
      return;
    }
    setSaving(true);
    try {
      await userApi.updateMe({
        character_key: avatarIdToCharacterKey(avatar.id),
        display_name: nickname.trim() || undefined,
        role_label: avatar.name,
      });
      await hydrate();
      router.push("/town");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SelectCharacterScene step={2} totalSteps={3}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: 18,
          padding: 18,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* ═══ LEFT COLUMN ═══ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflow: "auto",
            paddingRight: 6,
          }}
        >
          <PreviewCard avatar={avatar} name={nickname} age={age} />

          <div
            className="pixel-panel"
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <SectionLabel>{t("nickname")}</SectionLabel>
            <NicknameField value={nickname} onChange={setNickname} />

            <SectionLabel>
              {t("age")}{" "}
              <span
                className="font-silkscreen"
                style={{
                  color: "var(--accent-2)",
                  fontSize: 9,
                  fontWeight: 400,
                  letterSpacing: "0.1em",
                }}
              >
                · {t("ageLockedHint")}
              </span>
            </SectionLabel>
            <AgeSlider age={age} onChange={setAge} />

            <SectionLabel>{t("region")}</SectionLabel>
            <RegionSelect value={region} onChange={setRegion} />
            <div
              className="font-silkscreen"
              style={{ fontSize: 9, color: "var(--ink-dim)" }}
            >
              {t("regionSub")}
            </div>

            <SectionLabel>{t("dailyGoal")}</SectionLabel>
            <DailyGoalRadio value={goal} onChange={setGoal} />
          </div>
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <TabBar
              active={tab}
              onChange={setTab}
              interestsCount={interests.length}
              skillsCount={skills.length}
            />
            <div
              className="font-silkscreen"
              style={{
                fontSize: 10,
                color: "var(--ink-mute)",
                letterSpacing: "0.15em",
              }}
            >
              {t("roleSub")}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              paddingRight: 6,
            }}
          >
            {(tab === "role" || tab === "all") && (
              <section data-testid="role-section">
                <SectionLabel>{t("role")}</SectionLabel>
                <RoleGrid selected={selectedAvatar} onSelect={setSelectedAvatar} />
              </section>
            )}

            {(tab === "interests" || tab === "all") && (
              <section data-testid="interests-section">
                <SectionLabel>{t("interests")}</SectionLabel>
                <div
                  className="font-silkscreen"
                  style={{
                    fontSize: 9,
                    color: "var(--ink-dim)",
                    marginTop: 2,
                  }}
                >
                  {t("interestsSub")}
                </div>
                <InterestChips
                  value={interests}
                  onToggle={toggleIn(interests, setInterests)}
                />
              </section>
            )}

            {(tab === "skills" || tab === "all") && (
              <section data-testid="skills-section">
                <SectionLabel>{t("skills")}</SectionLabel>
                <div
                  className="font-silkscreen"
                  style={{
                    fontSize: 9,
                    color: "var(--ink-dim)",
                    marginTop: 2,
                  }}
                >
                  {t("skillsSub")}
                </div>
                <SkillChips
                  value={skills}
                  onToggle={toggleIn(skills, setSkills)}
                />
              </section>
            )}
          </div>

          <SummaryFooter
            roleName={avatar.name}
            interestsCount={interests.length}
            skillsCount={skills.length}
            canConfirm={!!nickname.trim()}
            saving={saving}
            onConfirm={onConfirm}
          />
        </div>
      </div>

      {msg ? (
        <div
          role="status"
          className="font-silkscreen"
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            padding: "8px 20px",
            background: "var(--card)",
            border: "1px solid var(--accent)",
            color: "var(--accent-2)",
            fontSize: 12,
            boxShadow: "var(--neon-glow)",
          }}
        >
          {msg}
        </div>
      ) : null}
    </SelectCharacterScene>
  );
}
