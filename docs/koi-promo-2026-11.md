# Six-month koi pond campaign

Owner-approved campaign: 2026-11-05 00:00 through 2026-12-05 23:59,
Asia/Taipei. Adults 18+ can DM `養魚` to Instagram `@lowbatterytown` to
request a code. One code per person; likes, shares, reposts and follows
are optional and are not redemption requirements. No purchase or draw.

The scene requires a large desktop window. Chat remains free and is not
affected by the scene. A code can be used on three devices; all share one
six-calendar-month term starting on its first successful activation in
Taiwan time. A missing day in the target month clamps to its last day.
Re-entering the code cannot restart the term. There is no automatic charge.

## Fulfilment

1. Check the inbound brand IG DM and whether this person has already received
   a code. Do not require screenshots of likes, shares or private profiles.
2. In API `/admin` → 解鎖碼, select `活動碼：首次啟用起六個月`, generate
   one code and copy it immediately. Keep notes to a non-personal campaign
   label; do not put IG usernames, e-mail addresses or DM text in D1.
3. Reply privately with the code and
   `https://www.lowbatterytown.com/zh-TW/unlock#code`, noting desktop-only,
   three devices and the shared six-month term.

Issuing and replying are manual. No automatic IG DM integration is implied.
Plain codes must not be committed or put in logs or public posts.

## Deployment

Apply D1 migration `0007_lbt_unlock_expiry.sql` before deploying the new API.
Existing purchased codes keep `duration_months = NULL` and do not acquire an
expiry. The client also drops a known expired promotional scene offline or
while its page remains open. The API enforces expiry on verification and
new redemptions.

Production `/zh-TW/demo` and `/en/demo` must return 404. Internal scripted
tests remain explicitly labelled and run only locally or in an isolated
build with `LBT_ENABLE_DEMO=1`. Never enable that flag in the public deploy.

Publish the campaign Reel only after the feature deploy is verified and the
owner approves the final video/caption. Publishing a draft is not fulfilment.
