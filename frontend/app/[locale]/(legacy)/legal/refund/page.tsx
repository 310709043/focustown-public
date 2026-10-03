import { getLocale } from "next-intl/server";

import { LegalLayout } from "@/components/legal/LegalLayout";
import { LegalDocHeader } from "@/components/legal/LegalDocHeader";
import { LegalSection } from "@/components/legal/LegalSection";
import { LEGAL } from "@/lib/config/legal";
import { Link } from "@/i18n/routing";

export const metadata = {
  title: "退款政策｜低電量小鎮",
  description:
    "了解低電量小鎮（Low Battery Town）付費商品的退款條件、申請流程與處理時程，協助您安心使用每一項服務。",
};

export default async function RefundPage() {
  const locale = await getLocale();
  const isZh = locale === "zh-TW";

  const jurisdiction = isZh ? LEGAL.jurisdiction : "the Republic of China (Taiwan)";
  const firstInstanceCourt = isZh
    ? LEGAL.firstInstanceCourt
    : "the Taiwan Taipei District Court";

  const TOC = [
    { id: "scope", title: isZh ? "1. 政策適用範圍" : "1. Scope" },
    { id: "cooling-off", title: isZh ? "2. 鑑賞期說明" : "2. Cooling-Off Period" },
    { id: "exceptions", title: isZh ? "3. 不適用鑑賞期之情形" : "3. Exceptions to the Cooling-Off Period" },
    { id: "non-refundable", title: isZh ? "4. 不可退款項目" : "4. Non-Refundable Items" },
    { id: "process", title: isZh ? "5. 退款申請流程" : "5. Refund Request Process" },
    { id: "timeline", title: isZh ? "6. 退款處理時程" : "6. Refund Processing Timeline" },
    { id: "disputes", title: isZh ? "7. 爭議處理" : "7. Dispute Resolution" },
    { id: "contact", title: isZh ? "8. 聯絡客服" : "8. Contact Support" },
  ];

  return (
    <LegalLayout active="refund" toc={TOC}>
      <LegalDocHeader
        title={isZh ? "退款政策" : "Refund Policy"}
        subtitle={
          isZh
            ? `${LEGAL.companyName}付費項目之退款說明`
            : `Refund information for ${LEGAL.companyName} paid items`
        }
        effectiveDate={LEGAL.effectiveDate}
        version={LEGAL.termsVersion}
      />

      <LegalSection id="scope" title={isZh ? "1. 政策適用範圍" : "1. Scope"}>
        {isZh ? (
          <p>本退款政策適用於您於本服務內購買之下列付費項目：</p>
        ) : (
          <p>This Refund Policy applies to the following paid items you purchase within the Service:</p>
        )}
        {isZh ? (
          <ul>
            <li><strong>虛擬貨幣</strong>（寶石、金幣等）；</li>
            <li><strong>虛擬商品</strong>（主題、頭像、裝飾、特殊效果）；</li>
            <li><strong>訂閱方案</strong>（如有）。</li>
          </ul>
        ) : (
          <ul>
            <li><strong>Virtual currency</strong> (gems, coins, etc.);</li>
            <li><strong>Virtual goods</strong> (themes, avatars, decorations, special effects);</li>
            <li><strong>Subscription plans</strong> (if any).</li>
          </ul>
        )}
        {isZh ? (
          <p>
            本服務目前所提供之核心功能（番茄鐘、配對、排行榜、成就）為免費使用，
            不涉及退款。
          </p>
        ) : (
          <p>
            The core features currently offered by the Service (Pomodoro timer, matching,
            leaderboards, achievements) are free to use and do not involve refunds.
          </p>
        )}
      </LegalSection>

      <LegalSection id="cooling-off" title={isZh ? "2. 鑑賞期說明" : "2. Cooling-Off Period"}>
        {isZh ? (
          <p>
            依{LEGAL.jurisdiction}<strong>消費者保護法第 19 條</strong>規定，
            通訊交易消費者得於收受商品或接受服務後<strong>7 日內</strong>，
            以退回商品或書面通知方式解除契約，無須說明理由及負擔任何費用或對價。
          </p>
        ) : (
          <p>
            Under <strong>Article 19 of the Consumer Protection Act</strong> of {jurisdiction}, a
            consumer in a distance transaction may rescind the contract within <strong>7 days</strong>{" "}
            of receiving the goods or accepting the service, by returning the goods or giving written
            notice, without stating any reason and without bearing any cost or consideration.
          </p>
        )}
        {isZh ? (
          <p>您得透過第 5 條規定之流程於 7 日內申請退款。</p>
        ) : (
          <p>
            You may apply for a refund within 7 days through the process set out in Section 5.
          </p>
        )}
      </LegalSection>

      <LegalSection
        id="exceptions"
        title={isZh ? "3. 不適用鑑賞期之情形" : "3. Exceptions to the Cooling-Off Period"}
      >
        {isZh ? (
          <p>
            依消費者保護法第 19 條之 2 及行政院公告之「<strong>通訊交易解除權合理例外情事適用準則</strong>」，
            下列情形<strong>不</strong>適用 7 日鑑賞期：
          </p>
        ) : (
          <p>
            Pursuant to Article 19-2 of the Consumer Protection Act and the{" "}
            <strong>
              Regulations Governing Reasonable Exceptions to the Right of Rescission in Distance
              Transactions
            </strong>{" "}
            announced by the Executive Yuan, the 7-day cooling-off period does <strong>not</strong>{" "}
            apply in the following situations:
          </p>
        )}
        {isZh ? (
          <ul>
            <li>非以有形媒介提供之數位內容或一經提供即為完成之線上服務，<strong>經您事前同意</strong>始提供；</li>
            <li>個人衛生用品（不適用本服務）；</li>
            <li>報紙、期刊或雜誌（不適用本服務）。</li>
          </ul>
        ) : (
          <ul>
            <li>
              digital content not provided on a tangible medium, or online services completed upon
              provision, that are supplied only <strong>with your prior consent</strong>;
            </li>
            <li>personal hygiene products (not applicable to the Service);</li>
            <li>newspapers, periodicals, or magazines (not applicable to the Service).</li>
          </ul>
        )}
        {isZh ? (
          <p>
            您於購買虛擬貨幣或虛擬商品時，將會看到「我同意提供後立即可使用，並放棄 7 日鑑賞期」之選項。
            一旦您勾選並完成購買，即不適用鑑賞期解除權。
            若您<strong>未</strong>勾選同意，則仍適用 7 日鑑賞期。
          </p>
        ) : (
          <p>
            When purchasing virtual currency or virtual goods, you will see the option &ldquo;I agree
            that the item becomes usable immediately upon provision and waive the 7-day cooling-off
            period.&rdquo; Once you check this option and complete the purchase, the cooling-off right
            of rescission no longer applies. If you do <strong>not</strong> check this option, the
            7-day cooling-off period still applies.
          </p>
        )}
      </LegalSection>

      <LegalSection id="non-refundable" title={isZh ? "4. 不可退款項目" : "4. Non-Refundable Items"}>
        {isZh ? (
          <p>下列情形之款項，原則上<strong>不予</strong>退還：</p>
        ) : (
          <p>
            As a general rule, payments in the following situations are <strong>non-refundable</strong>:
          </p>
        )}
        {isZh ? (
          <ul>
            <li>已使用、消費或兌換之虛擬貨幣；</li>
            <li>已啟用、配戴或套用之主題、頭像或裝飾；</li>
            <li>已開始使用之訂閱方案（按未使用之比例退還，詳第 6 條）；</li>
            <li>因您違反<Link href="/legal/terms">服務條款</Link>導致帳號被終止者；</li>
            <li>超過 7 日鑑賞期且不屬於可退款例外情形者。</li>
          </ul>
        ) : (
          <ul>
            <li>virtual currency that has been used, consumed, or redeemed;</li>
            <li>themes, avatars, or decorations that have been activated, equipped, or applied;</li>
            <li>
              subscription plans that have already begun (refunded pro rata for the unused portion;
              see Section 6);
            </li>
            <li>
              accounts terminated due to your violation of the{" "}
              <Link href="/legal/terms">Terms of Service</Link>;
            </li>
            <li>
              purchases beyond the 7-day cooling-off period that do not fall within a refundable
              exception.
            </li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="process" title={isZh ? "5. 退款申請流程" : "5. Refund Request Process"}>
        {isZh ? (
          <ol>
            <li>
              請來信至
              <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>，
              主旨註明「退款申請」。
            </li>
            <li>
              信件內容請包含：
              <ul>
                <li>您的帳號 email；</li>
                <li>訂單編號或購買日期；</li>
                <li>退款項目名稱；</li>
                <li>退款原因；</li>
                <li>金流明細（如刷卡末四碼）。</li>
              </ul>
            </li>
            <li>客服收到申請後將於 3 個工作日內審核並回覆。</li>
            <li>審核通過後依第 6 條時程退款。</li>
          </ol>
        ) : (
          <ol>
            <li>
              Email us at <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> with
              &ldquo;Refund Request&rdquo; in the subject line.
            </li>
            <li>
              Please include the following in your email:
              <ul>
                <li>your account email;</li>
                <li>the order number or purchase date;</li>
                <li>the name of the item to be refunded;</li>
                <li>the reason for the refund;</li>
                <li>payment details (such as the last four digits of the card).</li>
              </ul>
            </li>
            <li>
              After receiving your request, our support team will review and reply within 3 business
              days.
            </li>
            <li>Once approved, the refund will be issued per the timeline in Section 6.</li>
          </ol>
        )}
      </LegalSection>

      <LegalSection id="timeline" title={isZh ? "6. 退款處理時程" : "6. Refund Processing Timeline"}>
        {isZh ? (
          <ul>
            <li>
              <strong>信用卡付款</strong>：審核通過後 7 至 14 個工作日內，退款回原刷卡帳戶。
              實際到帳時間依發卡銀行作業而定。
            </li>
            <li>
              <strong>第三方支付</strong>（如 Apple In-App Purchase、Google Play）：
              依該平台之退款規則辦理。請逕向該平台申請。
            </li>
            <li>
              <strong>訂閱方案部分退款</strong>：
              按未使用之比例計算，扣除已使用期間之費用後退還餘額。
            </li>
          </ul>
        ) : (
          <ul>
            <li>
              <strong>Credit card payment</strong>: within 7 to 14 business days after approval, the
              refund is returned to the original card account. The actual posting time depends on the
              issuing bank&rsquo;s processing.
            </li>
            <li>
              <strong>Third-party payment</strong> (such as Apple In-App Purchase or Google Play):
              handled according to that platform&rsquo;s refund rules. Please apply directly to the
              platform.
            </li>
            <li>
              <strong>Partial subscription refund</strong>: calculated pro rata for the unused
              portion, with the balance refunded after deducting fees for the period already used.
            </li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="disputes" title={isZh ? "7. 爭議處理" : "7. Dispute Resolution"}>
        {isZh ? (
          <p>若您對退款結果有異議，得：</p>
        ) : (
          <p>If you disagree with the refund outcome, you may:</p>
        )}
        {isZh ? (
          <ul>
            <li>於 30 日內以書面方式向我們提出復議；</li>
            <li>向消費者保護官申訴；</li>
            <li>提交鄉鎮市調解委員會調解；</li>
            <li>向{LEGAL.firstInstanceCourt}起訴。</li>
          </ul>
        ) : (
          <ul>
            <li>submit a written request for reconsideration to us within 30 days;</li>
            <li>file a complaint with a consumer protection officer;</li>
            <li>refer the matter to a township/city mediation committee for mediation;</li>
            <li>bring an action before the {firstInstanceCourt}.</li>
          </ul>
        )}
      </LegalSection>

      <LegalSection id="contact" title={isZh ? "8. 聯絡客服" : "8. Contact Support"}>
        {isZh ? (
          <p>
            客服信箱：
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          </p>
        ) : (
          <p>
            Support email:{" "}
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          </p>
        )}
        {isZh ? (
          <p>服務時間：週一至週五 10:00–18:00（國定假日除外）。</p>
        ) : (
          <p>Support hours: Monday to Friday, 10:00–18:00 (excluding national holidays).</p>
        )}
      </LegalSection>
    </LegalLayout>
  );
}
