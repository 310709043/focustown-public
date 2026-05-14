# 中英文 SEO 文案原則｜溫柔軟體適用版

*Professional, natural, people-first SEO copy guidelines for soft and reassuring software experiences*

> **這份文件是 Focus Town 全站 i18n 文案的單一真實來源（single source of truth）。**
> 撰寫或修改 `frontend/messages/<locale>/*.json` 與後端 email 模板（如 `backend/app/domain/services/email_templates.py`）時，請依本文件規範。
>
> **This document is the single source of truth for all Focus Town i18n copy.**
> When writing or editing entries in `frontend/messages/<locale>/*.json` or backend email templates such as `backend/app/domain/services/email_templates.py`, please follow these guidelines.

---

## 中文 SEO 文案原則

中文文案應以「專業、溫柔、清楚」為核心：先滿足讀者的真實需求，再自然安排搜尋關鍵字。語氣上請使用「您」而非「你」，避免命令式、過度銷售或焦慮驅動的說法；讓使用者感覺被理解、被支持，而不是被推銷。

- **稱謂與語氣：** 統一使用「您／您的」，避免「你／你的」。可使用「我們會陪您」、「協助您」、「讓您更安心」等溫和句型；少用「立即」、「必看」、「錯過就虧」等壓迫感字眼。
- **關鍵字佈局：** 每頁設定一個主要搜尋意圖與 2–4 個輔助語意詞，將核心詞自然放入 H1、前 100 字、H2、小標、圖片替代文字與 meta description；不要為了密度重複堆疊。
- **標題與摘要：** 標題要清楚說明頁面價值，例如「協助您整理專案進度的溫柔任務管理工具」；meta description 建議 80–120 個中文字，包含主要關鍵字、使用情境與溫和 CTA。
- **內容結構：** 先回答「這能幫我解決什麼問題？」再說功能。建議使用短段落、具體情境、小標題、FAQ、步驟式說明與比較表，降低閱讀負擔並增加長尾搜尋機會。
- **專業可信度：** 避免空泛形容詞，如「最棒、超強、革命性」。改用可驗證的說法，例如支援的流程、資料保護方式、適用對象、整合工具、使用限制與常見疑問。
- **溫柔軟體用詞：** 優先使用「開始」、「查看」、「儲存」、「稍後再說」、「您可以選擇」；錯誤訊息避免責備，改寫為「目前無法完成儲存，請確認網路連線後再試一次」。
- **本地化細節：** 繁體中文請使用台灣常見詞彙，如「資料」而非「數據」視情境使用；「設定」而非「設置」；「登入」而非「登錄」。全站用語需一致。
- **行動與可讀性：** 句子盡量控制在 25–35 個中文字內，段落 2–4 行；重要資訊放在前面，讓手機使用者快速理解。
- **人本 SEO：** 內容應先為使用者提供有幫助、可靠、原創的答案，再做搜尋最佳化；避免只為排名製造大量相似頁面。

**範例語氣：**
「您可以先建立一個簡單清單，再依照自己的步調整理任務。我們會在需要時提醒您，不打擾您的工作節奏。」

---

## English SEO Copywriting Principles

English copy should feel calm, capable, and human. Use clear "you" language, but keep the tone supportive rather than pushy. Optimize around search intent, not keyword repetition: the reader should immediately understand what the software helps them do, why it is trustworthy, and how to take the next gentle step.

- **Voice and tone:** Use direct, warm language such as "You can," "When you are ready," "We will help you," and "Keep your work in one calm place." Avoid hype-heavy phrases like "ultimate," "crush your goals," or "must-have."
- **Keyword strategy:** Assign one primary intent per page and support it with related terms, use cases, and questions. Place the main phrase naturally in the H1, opening paragraph, H2s, image alt text, URL slug, and meta description.
- **Titles and meta descriptions:** Write titles that combine the product category with a clear benefit, for example "A Gentle Project Management Tool for Focused Teams." Keep meta descriptions benefit-led and natural, around 140–160 characters when possible.
- **Content structure:** Answer the user's need before listing features. Use scannable sections, short paragraphs, descriptive headings, FAQs, examples, and comparison blocks to capture long-tail queries without sounding mechanical.
- **Trust and clarity:** Replace vague claims like "best-in-class" with concrete proof, such as privacy practices, supported workflows, integrations, accessibility notes, onboarding steps, and realistic limitations.
- **Gentle software UX wording:** Prefer "Get started," "Save," "Review," "Skip for now," "You can change this later," and "Something went wrong. Please try again." Avoid blaming the user or creating urgency that does not exist.
- **Localization consistency:** Use one spelling standard per market, such as "organize" for US English or "organise" for UK English. Keep terminology consistent across navigation, onboarding, support pages, and product UI.
- **Readability:** Keep sentences concise, front-load the most useful information, and make each paragraph easy to scan on mobile. Natural clarity usually performs better than dense SEO wording.
- **People-first SEO:** Create helpful, reliable, original content for real users first, then make it easy for search engines to understand. Do not publish thin pages that only swap keywords or locations.

**Sample tone:**
"Start with a simple list, then organize your work at your own pace. We will remind you when it matters, without interrupting your flow."

---

## 適用範圍 ｜ Scope of application

| 區塊                                     | 路徑                                                |
| ---------------------------------------- | --------------------------------------------------- |
| 前端 i18n JSON                           | `frontend/messages/{en,zh-TW}/*.json`               |
| 後端通知 / Email 模板                    | `backend/app/domain/services/email_templates.py`    |
| 法律文件中的引導語、TOC、聯絡語句        | `frontend/app/[locale]/legal/*/page.tsx`            |
| 元件中的 aria-label / placeholder / 提示 | TSX 內所有 `aria-label=`、`placeholder=`、提示語句   |

任何在 TSX 直接寫死特定語言字串的程式碼都應改為從 i18n 命名空間讀取（`useTranslations` 或 `getTranslations`）。新增字串時：

1. 先依本文件規範撰寫雙語版本。
2. 將 key 放入對應 `messages/<locale>/<namespace>.json`。
3. 在 TSX 中以 `t('key')` 引用，不要在元件中保留硬編碼字串。

Any TSX literal in a specific language should be moved to the i18n namespaces and consumed via `useTranslations` / `getTranslations`. When adding new copy:

1. Write the bilingual pair against the rules above.
2. Add both keys under `messages/<locale>/<namespace>.json`.
3. Consume via `t('key')` in TSX — never leave a hardcoded language literal.

---

**Reference basis:** Aligned with Google Search Central guidance on helpful, reliable, people-first content and SEO practices that help search engines understand content while serving users first.
