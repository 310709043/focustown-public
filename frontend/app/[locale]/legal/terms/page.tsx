import { LegalLayout } from "@/components/legal/LegalLayout";
import { LegalDocHeader } from "@/components/legal/LegalDocHeader";
import { LegalSection } from "@/components/legal/LegalSection";
import { LEGAL } from "@/lib/config/legal";
import { Link } from "@/i18n/routing";

export const metadata = {
  title: "服務條款 — Focus Town",
  description: "Focus Town 服務條款",
};

const TOC = [
  { id: "intro", title: "1. 條款接受" },
  { id: "account", title: "2. 帳號註冊與管理" },
  { id: "use", title: "3. 服務使用規範" },
  { id: "content", title: "4. 使用者內容與授權" },
  { id: "third-party", title: "5. 第三方服務" },
  { id: "fees", title: "6. 付費項目與虛擬商品" },
  { id: "changes", title: "7. 服務變更、暫停與終止" },
  { id: "disclaimer", title: "8. 免責聲明與責任限制" },
  { id: "law", title: "9. 適用法律與管轄" },
  { id: "contact", title: "10. 聯絡方式" },
];

export default function TermsPage() {
  return (
    <LegalLayout active="terms" toc={TOC}>
      <LegalDocHeader
        title="服務條款"
        subtitle={`歡迎使用 ${LEGAL.companyName}。請仔細閱讀以下條款。`}
        effectiveDate={LEGAL.effectiveDate}
        version={LEGAL.termsVersion}
      />

      <LegalSection id="intro" title="1. 條款接受">
        <p>
          本服務條款（下稱「<strong>本條款</strong>」）為您（下稱「<strong>使用者</strong>」）與
          {LEGAL.companyName}（下稱「<strong>本服務</strong>」或「我們」）之間就使用本服務所成立之契約。
        </p>
        <p>
          當您完成註冊、勾選同意本條款並點擊「註冊」按鈕，或以任何方式存取本服務，
          即視為您已詳細閱讀、瞭解並同意受本條款及
          <Link href="/legal/privacy">隱私政策</Link>之拘束。
          若您不同意全部或部分條款，請立即停止使用本服務。
        </p>
        <p>
          若您未滿 18 歲，須由其法定代理人陪同閱讀本條款，並由法定代理人同意後始得使用本服務。
          未滿 13 歲者不得註冊或使用本服務。
        </p>
      </LegalSection>

      <LegalSection id="account" title="2. 帳號註冊與管理">
        <p>您於註冊時應提供真實、正確、最新且完整之資料，並承諾持續維護其正確性。</p>
        <p>
          您應自行妥善保管帳號密碼，且應為帳號內所有活動負責。
          如發現帳號遭未經授權之使用，您應立即通知我們。
        </p>
        <p>
          我們得因下列事由暫停或終止您的帳號：
        </p>
        <ul>
          <li>違反本條款或相關法令；</li>
          <li>提供虛假、誤導或冒用他人資料；</li>
          <li>從事任何危害本服務、其他使用者或第三人權益之行為；</li>
          <li>帳號逾 12 個月未登入，得依後續通知程序處置。</li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="3. 服務使用規範">
        <p>使用本服務時，您承諾<strong>不</strong>從事下列行為：</p>
        <ul>
          <li>騷擾、辱罵、誹謗、跟蹤或威脅其他使用者；</li>
          <li>傳送色情、暴力、仇恨言論或違反公共秩序、善良風俗之內容；</li>
          <li>使用任何自動化工具、爬蟲、機器人或外掛程式存取本服務；</li>
          <li>規避、破壞、干擾本服務之配對機制、計時器或排行榜；</li>
          <li>進行逆向工程、反編譯或試圖取得本服務之原始碼；</li>
          <li>侵害本服務或第三人之智慧財產權、隱私權或其他權利；</li>
          <li>傳送病毒、惡意程式或任何有害本服務之程式碼；</li>
          <li>從事任何違反中華民國或您所在地法律之行為。</li>
        </ul>
        <p>
          您所進行之專注計時、配對紀錄、排行榜資料、聊天訊息等均應符合本款之規範。
          違反者，我們得不經事前通知刪除相關內容、暫停或終止您的帳號。
        </p>
      </LegalSection>

      <LegalSection id="content" title="4. 使用者內容與授權">
        <p>
          您於本服務內輸入或上傳之文字、圖像或其他內容（下稱「<strong>使用者內容</strong>」），
          其著作權及其他智慧財產權仍屬於您或合法權利人所有。
        </p>
        <p>
          為提供本服務所必要之範圍，您授予我們<strong>非專屬、全球、免權利金、可轉授權</strong>
          之授權，得使用、重製、修改、改作、公開傳輸、公開展示及散布該使用者內容。
          授權範圍以提供、改善、宣傳本服務為限，且不包含將您的內容用於與本服務無關之第三方廣告。
        </p>
        <p>
          您應確保使用者內容不侵害任何第三人之權利。
          若因您的內容侵害他人權利導致本服務或第三人受有損害，您應自行負責賠償。
        </p>
      </LegalSection>

      <LegalSection id="third-party" title="5. 第三方服務">
        <p>
          本服務可能整合或連結至第三方服務（例如雲端推播、雲端儲存、AWS 等基礎設施）。
          該等第三方服務有其各自之服務條款與隱私政策，請您自行閱讀並遵守。
        </p>
        <p>
          我們對於第三方服務之內容、可用性、隱私實踐或商業行為均不承擔任何擔保責任。
        </p>
      </LegalSection>

      <LegalSection id="fees" title="6. 付費項目與虛擬商品">
        <p>
          本服務目前提供之核心功能（番茄鐘專注、配對、排行榜、成就）為免費使用。
          我們得於商城（Shop）提供付費的虛擬商品、寶石、主題或訂閱方案。
        </p>
        <p>
          所有付費項目之退款條件，依
          <Link href="/legal/refund">退款政策</Link>辦理。
          虛擬商品本身不具現實貨幣價值，且不得轉讓或換現。
        </p>
        <p>
          我們得隨時調整付費項目之價格、內容或上下架，並將於合理期間以站內公告或電子郵件通知您。
        </p>
      </LegalSection>

      <LegalSection id="changes" title="7. 服務變更、暫停與終止">
        <p>
          我們得基於營運、技術、法令或安全考量，隨時新增、修改、暫停或停止全部或部分服務內容。
          重大變更將於本頁面公告，並視情況以電子郵件通知您。
        </p>
        <p>
          您得隨時透過帳號設定停用帳號。
          帳號終止後，您於本服務內之資料保存與刪除，依
          <Link href="/legal/privacy">隱私政策</Link>辦理。
        </p>
        <p>
          因您違反本條款而被終止帳號者，您已支付之費用不予退還，但法令另有規定者不在此限。
        </p>
      </LegalSection>

      <LegalSection id="disclaimer" title="8. 免責聲明與責任限制">
        <p>
          本服務以「現況」（as-is）及「現有」（as-available）方式提供，
          我們未對本服務之即時性、無錯誤、無中斷、適合特定目的或不侵害第三人權利提供任何明示或默示之擔保。
        </p>
        <p>
          除我們故意或重大過失外，我們對於您因使用或無法使用本服務所生之任何直接、間接、附隨、特殊、
          懲罰性或衍生性損害，不負損害賠償責任。
          縱使我們已被告知該等損害發生之可能性，亦同。
        </p>
        <p>
          法令對消費者保護有強制規定者，依其規定辦理。
        </p>
      </LegalSection>

      <LegalSection id="law" title="9. 適用法律與管轄">
        <p>
          本條款之解釋、效力與履行，悉依{LEGAL.jurisdiction}法律為準據法。
          因本條款或本服務所生之爭議，雙方同意以
          <strong>{LEGAL.firstInstanceCourt}</strong>為第一審管轄法院。
          但消費者保護法第 47 條或其他法令對消費者管轄另有規定者，從其規定。
        </p>
      </LegalSection>

      <LegalSection id="contact" title="10. 聯絡方式">
        <p>
          若您對本條款有任何疑問或建議，歡迎來信：
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
