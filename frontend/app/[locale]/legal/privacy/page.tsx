import { getLocale } from "next-intl/server";

import { LegalLayout } from "@/components/legal/LegalLayout";
import { LegalDocHeader } from "@/components/legal/LegalDocHeader";
import { LegalSection } from "@/components/legal/LegalSection";
import { LEGAL } from "@/lib/config/legal";

export const metadata = {
  title: "隱私政策｜低電量小鎮",
  description:
    "了解低電量小鎮（Low Battery Town）如何依個人資料保護法蒐集、處理與利用您的個資，以及您享有的權利。",
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  const isZh = locale === "zh-TW";

  const jurisdiction = isZh ? LEGAL.jurisdiction : "the Republic of China (Taiwan)";

  const TOC = [
    { id: "intro", title: isZh ? "1. 政策宗旨" : "1. Purpose of This Policy" },
    { id: "collect", title: isZh ? "2. 蒐集之個資項目" : "2. Categories of Data Collected" },
    { id: "purpose", title: isZh ? "3. 蒐集目的與法律基礎" : "3. Purposes & Legal Basis" },
    { id: "use", title: isZh ? "4. 利用方式與範圍" : "4. Use & Scope" },
    { id: "share", title: isZh ? "5. 對外提供與委外" : "5. Disclosure & Processors" },
    { id: "retention", title: isZh ? "6. 保存期間" : "6. Retention Periods" },
    { id: "rights", title: isZh ? "7. 當事人權利" : "7. Your Rights" },
    { id: "cookies", title: isZh ? "8. Cookie 與類似技術" : "8. Cookies & Similar Technologies" },
    { id: "minors", title: isZh ? "9. 兒少資料保護" : "9. Protection of Minors" },
    { id: "security", title: isZh ? "10. 資安措施" : "10. Security Measures" },
    { id: "international", title: isZh ? "11. 跨境傳輸" : "11. Cross-Border Transfers" },
    { id: "update", title: isZh ? "12. 政策更新" : "12. Policy Updates" },
    { id: "contact", title: isZh ? "13. 聯絡窗口" : "13. Contact" },
  ];

  return (
    <LegalLayout active="privacy" toc={TOC}>
      <LegalDocHeader
        title={isZh ? "隱私政策" : "Privacy Policy"}
        subtitle={
          isZh
            ? `${LEGAL.companyName}個人資料蒐集、處理及利用之說明`
            : `How ${LEGAL.companyName} collects, processes, and uses your personal data`
        }
        effectiveDate={LEGAL.effectiveDate}
        version={LEGAL.termsVersion}
      />

      <LegalSection id="intro" title={isZh ? "1. 政策宗旨" : "1. Purpose of This Policy"}>
        {isZh ? (
          <p>
            {LEGAL.companyName}（以下稱「本服務」或「我們」）非常重視您的個人資料及隱私權保護。
            本政策依{LEGAL.jurisdiction}個人資料保護法（下稱「個資法」）及相關法令，
            並參考歐盟一般資料保護規則（GDPR）之最佳實務制定。
          </p>
        ) : (
          <p>
            {LEGAL.companyName} (the &ldquo;Service&rdquo; or &ldquo;we&rdquo;) takes the protection
            of your personal data and privacy very seriously. This Policy is formulated in accordance
            with the Personal Data Protection Act of {jurisdiction} (the &ldquo;PDPA&rdquo;) and
            related laws, with reference to the best practices of the EU General Data Protection
            Regulation (GDPR).
          </p>
        )}
        {isZh ? (
          <p>
            本政策說明我們如何蒐集、處理、利用及保護您的個人資料，
            以及您依法享有之權利。請您於使用本服務前詳細閱讀。
          </p>
        ) : (
          <p>
            This Policy explains how we collect, process, use, and protect your personal data, as
            well as the rights you are entitled to under the law. Please read it carefully before
            using the Service.
          </p>
        )}
      </LegalSection>

      <LegalSection id="collect" title={isZh ? "2. 蒐集之個資項目" : "2. Categories of Data Collected"}>
        {isZh ? (
          <p>我們將於下列情形蒐集您的個人資料：</p>
        ) : (
          <p>We collect your personal data in the following circumstances:</p>
        )}
        {isZh ? (
          <ul>
            <li>
              <strong>註冊及帳號管理</strong>：
              電子郵件、顯示名稱、密碼（以 bcrypt 雜湊儲存，非明文）、帳號角色標籤、頭像（character key）。
            </li>
            <li>
              <strong>使用本服務時自動產生</strong>：
              專注時段（focus session）起訖時間、模式、任務標籤、是否完成；
              配對（match）紀錄；排行榜分數；成就解鎖紀錄；筆記內容；商店購買紀錄。
            </li>
            <li>
              <strong>即時聊天</strong>：
              您於配對焦點房間中傳送或接收的聊天訊息（暫存於 Redis，依下方「保存期間」處理）。
            </li>
            <li>
              <strong>裝置與技術資訊</strong>：
              IP 位址、瀏覽器類型與版本、作業系統、語言設定、操作時間戳記、伺服器日誌。
            </li>
            <li>
              <strong>行銷與通知偏好</strong>：
              您是否同意接收電子報、產品更新通知（marketing_opt_in）及同意條款之時間戳記（terms_accepted_at）與版本。
            </li>
          </ul>
        ) : (
          <ul>
            <li>
              <strong>Registration and account management</strong>: email address, display name,
              password (stored as a bcrypt hash, never in plaintext), account role tag, and avatar
              (character key).
            </li>
            <li>
              <strong>Automatically generated during use of the Service</strong>: focus session
              start/end times, mode, task tags, and completion status; match records; leaderboard
              scores; achievement-unlock records; note content; and Shop purchase records.
            </li>
            <li>
              <strong>Real-time chat</strong>: chat messages you send or receive in matched focus
              rooms (temporarily stored in Redis and handled per the &ldquo;Retention Periods&rdquo;
              section below).
            </li>
            <li>
              <strong>Device and technical information</strong>: IP address, browser type and
              version, operating system, language settings, operation timestamps, and server logs.
            </li>
            <li>
              <strong>Marketing and notification preferences</strong>: whether you have consented to
              receive newsletters and product-update notifications (marketing_opt_in), and the
              timestamp (terms_accepted_at) and version of your acceptance of the terms.
            </li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="purpose" title={isZh ? "3. 蒐集目的與法律基礎" : "3. Purposes & Legal Basis"}>
        {isZh ? (
          <p>我們蒐集您的個人資料之目的及法律基礎如下：</p>
        ) : (
          <p>The purposes and legal basis for collecting your personal data are as follows:</p>
        )}
        {isZh ? (
          <ul>
            <li>
              <strong>提供本服務</strong>（個資法 §19 I-2 契約必要）：
              註冊登入、專注計時、配對、排行榜、聊天等核心功能運作。
            </li>
            <li>
              <strong>帳號安全</strong>（個資法 §19 I-2、§20 I-1）：
              密碼重設、防止盜用、異常登入偵測、防止濫用、頻率限制（rate limiting）。
            </li>
            <li>
              <strong>客服支援</strong>（個資法 §19 I-2）：
              處理您的查詢、客訴及帳號變更請求。
            </li>
            <li>
              <strong>法令遵循</strong>（個資法 §19 I-1）：
              符合稅務、消保、洗錢防制等法令要求。
            </li>
            <li>
              <strong>行銷及產品改善</strong>（您之同意，個資法 §19 I-5）：
              僅於您勾選同意接收電子報後，始用於寄送產品更新與行銷資訊。
              您得隨時於帳號設定取消此項同意。
            </li>
          </ul>
        ) : (
          <ul>
            <li>
              <strong>Providing the Service</strong> (PDPA §19 I-2, necessity for performance of a
              contract): operation of core features such as registration and login, focus timing,
              matching, leaderboards, and chat.
            </li>
            <li>
              <strong>Account security</strong> (PDPA §19 I-2, §20 I-1): password reset, prevention
              of account theft, anomalous-login detection, abuse prevention, and rate limiting.
            </li>
            <li>
              <strong>Customer support</strong> (PDPA §19 I-2): handling your inquiries, complaints,
              and account-change requests.
            </li>
            <li>
              <strong>Legal compliance</strong> (PDPA §19 I-1): meeting tax, consumer-protection,
              anti-money-laundering, and other legal requirements.
            </li>
            <li>
              <strong>Marketing and product improvement</strong> (your consent, PDPA §19 I-5): used
              to send product updates and marketing information only after you have checked the box
              to receive newsletters. You may withdraw this consent at any time in your account
              settings.
            </li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="use" title={isZh ? "4. 利用方式與範圍" : "4. Use & Scope"}>
        {isZh ? (
          <p>
            我們將於前述蒐集目的所必要之範圍內利用您的個人資料。
            利用之地區包括本服務伺服器所在地（目前為東京 ap-northeast-1）及您所在地。
          </p>
        ) : (
          <p>
            We use your personal data only to the extent necessary for the collection purposes
            described above. The regions of use include the location of the Service&rsquo;s servers
            (currently Tokyo, ap-northeast-1) and your location.
          </p>
        )}
        {isZh ? (
          <p>
            利用之對象限於本服務及其受託處理之機構。
            除取得您同意或法律另有規定外，我們<strong>不會</strong>將您的個人資料對外提供或出售。
          </p>
        ) : (
          <p>
            The parties using your data are limited to the Service and its commissioned processors.
            Except with your consent or as otherwise required by law, we <strong>will not</strong>{" "}
            disclose or sell your personal data to outside parties.
          </p>
        )}
      </LegalSection>

      <LegalSection id="share" title={isZh ? "5. 對外提供與委外" : "5. Disclosure & Processors"}>
        {isZh ? (
          <p>於下列情形，我們可能對外提供您的個人資料：</p>
        ) : (
          <p>We may disclose your personal data to outside parties in the following situations:</p>
        )}
        {isZh ? (
          <ul>
            <li><strong>委外處理</strong>：基礎設施與雲端服務商（如 AWS、Cloudflare），均簽署資料處理協議；</li>
            <li><strong>法令要求</strong>：依法院、檢察官、警察機關或其他主管機關依法所為之要求；</li>
            <li><strong>保護權利</strong>：為保護本服務、其他使用者或第三人之生命、身體、財產或權益所必要；</li>
            <li><strong>經您同意</strong>：經您事前明示同意之第三方提供。</li>
          </ul>
        ) : (
          <ul>
            <li>
              <strong>Commissioned processing</strong>: infrastructure and cloud service providers
              (such as AWS and Cloudflare), each of which has signed a data processing agreement;
            </li>
            <li>
              <strong>Legal requirements</strong>: requests lawfully made by courts, prosecutors,
              police authorities, or other competent authorities;
            </li>
            <li>
              <strong>Protection of rights</strong>: where necessary to protect the life, body,
              property, or rights of the Service, other users, or third parties;
            </li>
            <li>
              <strong>With your consent</strong>: disclosure to third parties to which you have given
              prior express consent.
            </li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="retention" title={isZh ? "6. 保存期間" : "6. Retention Periods"}>
        {isZh ? (
          <ul>
            <li>帳號基本資料：自您註冊起，至您請求刪除或停用帳號後 30 日為止；</li>
            <li>專注時段及成就：至您請求刪除或停用帳號後 30 日為止；</li>
            <li>聊天訊息：自配對結束後 24 小時自動清除；</li>
            <li>密碼重設令牌：1 小時後自動失效，使用後即作廢；</li>
            <li>伺服器存取日誌：90 日；</li>
            <li>依法令需保存者，依其規定保存期間。</li>
          </ul>
        ) : (
          <ul>
            <li>
              Basic account data: from your registration until 30 days after you request deletion or
              deactivation of your account;
            </li>
            <li>
              Focus sessions and achievements: until 30 days after you request deletion or
              deactivation of your account;
            </li>
            <li>Chat messages: automatically purged 24 hours after a match ends;</li>
            <li>
              Password reset tokens: automatically expire after 1 hour and are voided once used;
            </li>
            <li>Server access logs: 90 days;</li>
            <li>
              Data required to be retained by law: for the retention period prescribed by such law.
            </li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="rights" title={isZh ? "7. 當事人權利" : "7. Your Rights"}>
        {isZh ? (
          <p>依個資法第 3 條及 GDPR 規定，您就您的個人資料享有下列權利：</p>
        ) : (
          <p>
            Under Article 3 of the PDPA and the GDPR, you have the following rights with respect to
            your personal data:
          </p>
        )}
        {isZh ? (
          <ul>
            <li><strong>查詢或請求閱覽</strong>；</li>
            <li><strong>請求製給複製本</strong>；</li>
            <li><strong>請求補充或更正</strong>；</li>
            <li><strong>請求停止蒐集、處理或利用</strong>；</li>
            <li><strong>請求刪除</strong>；</li>
            <li><strong>撤回同意</strong>（特別是行銷通知）；</li>
            <li><strong>資料可攜權</strong>（請求以結構化、機器可讀之格式提供）。</li>
          </ul>
        ) : (
          <ul>
            <li><strong>To inquire about or request to review</strong> your data;</li>
            <li><strong>To request a copy</strong> of your data;</li>
            <li><strong>To request supplementation or correction</strong>;</li>
            <li><strong>To request cessation of collection, processing, or use</strong>;</li>
            <li><strong>To request deletion</strong>;</li>
            <li><strong>To withdraw consent</strong> (in particular for marketing notifications);</li>
            <li>
              <strong>Data portability</strong> (to request your data in a structured,
              machine-readable format).
            </li>
          </ul>
        )}
        {isZh ? (
          <p>
            您得透過帳號設定行使上述權利，或來信
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>提出申請。
            我們將於 30 日內回覆。
            您得免費為前項申請，但若您於 12 個月內重複申請相同事項，我們得收取必要成本。
          </p>
        ) : (
          <p>
            You may exercise the above rights through your account settings, or submit a request by
            email to <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. We will
            respond within 30 days. You may make such a request free of charge; however, if you
            repeat the same request within 12 months, we may charge the necessary costs.
          </p>
        )}
        {isZh ? (
          <p>若您不提供必要之個人資料，可能無法享有本服務之全部或部分功能。</p>
        ) : (
          <p>
            If you do not provide the necessary personal data, you may be unable to enjoy all or part
            of the Service&rsquo;s features.
          </p>
        )}
      </LegalSection>

      <LegalSection id="cookies" title={isZh ? "8. Cookie 與類似技術" : "8. Cookies & Similar Technologies"}>
        {isZh ? (
          <p>本服務目前使用下列瀏覽器儲存機制：</p>
        ) : (
          <p>The Service currently uses the following browser storage mechanisms:</p>
        )}
        {isZh ? (
          <ul>
            <li><strong>localStorage</strong>：儲存您的登入令牌（access / refresh token），以便維持登入狀態；</li>
            <li><strong>session 識別</strong>：用於 WebSocket 連線維護。</li>
          </ul>
        ) : (
          <ul>
            <li>
              <strong>localStorage</strong>: stores your login tokens (access / refresh token) so
              that you remain signed in;
            </li>
            <li><strong>Session identifier</strong>: used to maintain the WebSocket connection.</li>
          </ul>
        )}
        {isZh ? (
          <p>
            我們目前<strong>不</strong>使用第三方廣告追蹤 Cookie。
            若未來新增分析或行銷 Cookie，將於本頁面更新並徵求您的同意。
          </p>
        ) : (
          <p>
            We currently do <strong>not</strong> use third-party advertising tracking cookies. If we
            add analytics or marketing cookies in the future, we will update this page and seek your
            consent.
          </p>
        )}
      </LegalSection>

      <LegalSection id="minors" title={isZh ? "9. 兒少資料保護" : "9. Protection of Minors"}>
        {isZh ? (
          <p>
            本服務之使用對象為 13 歲以上之自然人。
            我們<strong>不會</strong>故意蒐集 13 歲以下兒童之個人資料。
            若您發現您未滿 13 歲之子女已註冊本服務，請聯繫我們，我們將儘速刪除相關資料。
          </p>
        ) : (
          <p>
            The Service is intended for natural persons aged 13 or older. We do <strong>not</strong>{" "}
            knowingly collect the personal data of children under 13. If you discover that your child
            under 13 has registered for the Service, please contact us and we will delete the relevant
            data as soon as possible.
          </p>
        )}
      </LegalSection>

      <LegalSection id="security" title={isZh ? "10. 資安措施" : "10. Security Measures"}>
        {isZh ? (
          <p>我們採取下列措施保護您的個人資料：</p>
        ) : (
          <p>We take the following measures to protect your personal data:</p>
        )}
        {isZh ? (
          <ul>
            <li>密碼採用 bcrypt 演算法雜湊儲存，<strong>不</strong>保存明文；</li>
            <li>所有 API 流量透過 HTTPS（生產環境）加密傳輸；</li>
            <li>密碼重設令牌僅儲存 SHA-256 雜湊值，且為一次性使用；</li>
            <li>對登入、註冊、忘記密碼等敏感端點實施頻率限制（rate limiting）；</li>
            <li>採用 CSP、X-Frame-Options、Referrer-Policy 等 HTTP 安全標頭；</li>
            <li>定期執行安全更新與弱點掃描；</li>
            <li>對員工與委外處理機構簽訂保密協議。</li>
          </ul>
        ) : (
          <ul>
            <li>
              Passwords are stored hashed using the bcrypt algorithm and are <strong>not</strong>{" "}
              kept in plaintext;
            </li>
            <li>All API traffic is encrypted in transit via HTTPS (in the production environment);</li>
            <li>
              Password reset tokens are stored only as SHA-256 hashes and are single-use;
            </li>
            <li>
              Rate limiting is applied to sensitive endpoints such as login, registration, and
              forgot-password;
            </li>
            <li>
              HTTP security headers such as CSP, X-Frame-Options, and Referrer-Policy are used;
            </li>
            <li>Security updates and vulnerability scans are performed regularly;</li>
            <li>
              Confidentiality agreements are signed with employees and commissioned processors.
            </li>
          </ul>
        )}
        {isZh ? (
          <p>
            惟網路傳輸不能保證絕對安全。
            若發生個資外洩事件，我們將於發現後 72 小時內通知主管機關及受影響之當事人。
          </p>
        ) : (
          <p>
            However, no transmission over the internet can be guaranteed to be absolutely secure. In
            the event of a personal data breach, we will notify the competent authority and affected
            data subjects within 72 hours of discovery.
          </p>
        )}
      </LegalSection>

      <LegalSection id="international" title={isZh ? "11. 跨境傳輸" : "11. Cross-Border Transfers"}>
        {isZh ? (
          <p>
            本服務之伺服器位於東京（AWS ap-northeast-1），您的資料可能在台灣境外之伺服器處理。
            我們將確保跨境傳輸所至之地區提供與本政策相當之資料保護水準。
          </p>
        ) : (
          <p>
            The Service&rsquo;s servers are located in Tokyo (AWS ap-northeast-1), so your data may
            be processed on servers outside Taiwan. We will ensure that the regions to which data is
            transferred across borders provide a level of data protection comparable to this Policy.
          </p>
        )}
      </LegalSection>

      <LegalSection id="update" title={isZh ? "12. 政策更新" : "12. Policy Updates"}>
        {isZh ? (
          <p>
            我們得不定期更新本政策。
            重大變更將於本頁面公告，並視情況以電子郵件通知您。
            若您於修正後繼續使用本服務，視為您同意修正後之政策。
          </p>
        ) : (
          <p>
            We may update this Policy from time to time. Material changes will be announced on this
            page and, where appropriate, notified to you by email. If you continue to use the Service
            after such revisions, you are deemed to have agreed to the revised Policy.
          </p>
        )}
      </LegalSection>

      <LegalSection id="contact" title={isZh ? "13. 聯絡窗口" : "13. Contact"}>
        {isZh ? (
          <p>
            如您對本政策或您的個人資料處理有任何疑問，歡迎來信：
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          </p>
        ) : (
          <p>
            If you have any questions about this Policy or the processing of your personal data,
            please email us at{" "}
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
          </p>
        )}
      </LegalSection>
    </LegalLayout>
  );
}
