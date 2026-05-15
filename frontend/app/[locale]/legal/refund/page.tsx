import { LegalLayout } from "@/components/legal/LegalLayout";
import { LegalDocHeader } from "@/components/legal/LegalDocHeader";
import { LegalSection } from "@/components/legal/LegalSection";
import { LEGAL } from "@/lib/config/legal";
import { Link } from "@/i18n/routing";

export const metadata = {
  title: "退款政策 — Focus Town",
  description: "Focus Town 付費項目之退款說明",
};

const TOC = [
  { id: "scope", title: "1. 政策適用範圍" },
  { id: "cooling-off", title: "2. 鑑賞期說明" },
  { id: "exceptions", title: "3. 不適用鑑賞期之情形" },
  { id: "non-refundable", title: "4. 不可退款項目" },
  { id: "process", title: "5. 退款申請流程" },
  { id: "timeline", title: "6. 退款處理時程" },
  { id: "disputes", title: "7. 爭議處理" },
  { id: "contact", title: "8. 聯絡客服" },
];

export default function RefundPage() {
  return (
    <LegalLayout active="refund" toc={TOC}>
      <LegalDocHeader
        title="退款政策"
        subtitle={`${LEGAL.companyName}付費項目之退款說明`}
        effectiveDate={LEGAL.effectiveDate}
        version={LEGAL.termsVersion}
      />

      <LegalSection id="scope" title="1. 政策適用範圍">
        <p>本退款政策適用於您於本服務內購買之下列付費項目：</p>
        <ul>
          <li><strong>虛擬貨幣</strong>（寶石、金幣等）；</li>
          <li><strong>虛擬商品</strong>（主題、頭像、裝飾、特殊效果）；</li>
          <li><strong>訂閱方案</strong>（如有）。</li>
        </ul>
        <p>
          本服務目前所提供之核心功能（番茄鐘、配對、排行榜、成就）為免費使用，
          不涉及退款。
        </p>
      </LegalSection>

      <LegalSection id="cooling-off" title="2. 鑑賞期說明">
        <p>
          依{LEGAL.jurisdiction}<strong>消費者保護法第 19 條</strong>規定，
          通訊交易消費者得於收受商品或接受服務後<strong>7 日內</strong>，
          以退回商品或書面通知方式解除契約，無須說明理由及負擔任何費用或對價。
        </p>
        <p>
          您得透過第 5 條規定之流程於 7 日內申請退款。
        </p>
      </LegalSection>

      <LegalSection id="exceptions" title="3. 不適用鑑賞期之情形">
        <p>
          依消費者保護法第 19 條之 2 及行政院公告之「<strong>通訊交易解除權合理例外情事適用準則</strong>」，
          下列情形<strong>不</strong>適用 7 日鑑賞期：
        </p>
        <ul>
          <li>非以有形媒介提供之數位內容或一經提供即為完成之線上服務，<strong>經您事前同意</strong>始提供；</li>
          <li>個人衛生用品（不適用本服務）；</li>
          <li>報紙、期刊或雜誌（不適用本服務）。</li>
        </ul>
        <p>
          您於購買虛擬貨幣或虛擬商品時，將會看到「我同意提供後立即可使用，並放棄 7 日鑑賞期」之選項。
          一旦您勾選並完成購買，即不適用鑑賞期解除權。
          若您<strong>未</strong>勾選同意，則仍適用 7 日鑑賞期。
        </p>
      </LegalSection>

      <LegalSection id="non-refundable" title="4. 不可退款項目">
        <p>下列情形之款項，原則上<strong>不予</strong>退還：</p>
        <ul>
          <li>已使用、消費或兌換之虛擬貨幣；</li>
          <li>已啟用、配戴或套用之主題、頭像或裝飾；</li>
          <li>已開始使用之訂閱方案（按未使用之比例退還，詳第 6 條）；</li>
          <li>因您違反<Link href="/legal/terms">服務條款</Link>導致帳號被終止者；</li>
          <li>超過 7 日鑑賞期且不屬於可退款例外情形者。</li>
        </ul>
      </LegalSection>

      <LegalSection id="process" title="5. 退款申請流程">
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
      </LegalSection>

      <LegalSection id="timeline" title="6. 退款處理時程">
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
      </LegalSection>

      <LegalSection id="disputes" title="7. 爭議處理">
        <p>
          若您對退款結果有異議，得：
        </p>
        <ul>
          <li>於 30 日內以書面方式向我們提出復議；</li>
          <li>向消費者保護官申訴；</li>
          <li>提交鄉鎮市調解委員會調解；</li>
          <li>向{LEGAL.firstInstanceCourt}起訴。</li>
        </ul>
      </LegalSection>

      <LegalSection id="contact" title="8. 聯絡客服">
        <p>
          客服信箱：
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        </p>
        <p>服務時間：週一至週五 10:00–18:00（國定假日除外）。</p>
      </LegalSection>
    </LegalLayout>
  );
}
