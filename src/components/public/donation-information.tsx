"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { donationDetails } from "@/config/donation";
import type { Language } from "@/lib/i18n/public-copy";
import { Icon } from "./icon";
import styles from "./donation-information.module.css";

const text = {
  en: {
    introduction: "Support the Rittapadu Saraswathi Puja celebration.",
    qr: "Donation payment QR for PINNINTI DINESH",
    enlarge: "Enlarge QR",
    scan: "Scan to contribute",
    details: "Payment details",
    recipient: "Recipient",
    mobile: "UPI-linked mobile number",
    instructions: "How to contribute",
    steps: [
      "Open your UPI app and scan the QR. On the same phone, save the image and choose it from your UPI app’s gallery scanner, if supported.",
      "Check that the recipient name is PINNINTI DINESH before confirming payment.",
      "For contribution recording or any payment questions, contact the organiser using the number above.",
    ],
    note: "Contributions are verified and updated manually by the organiser. A payment does not automatically update Chandas or generate a website receipt.",
    save: "Save QR image",
    close: "Close",
    failed: "QR image could not load. Please reload the page or contact the organiser.",
    warning: "Check the recipient name in your UPI app before paying.",
  },
  te: {
    introduction: "Rittapadu సరస్వతి పూజా మహోత్సవానికి మీ సహకారం అందించండి.",
    qr: "PINNINTI DINESH విరాళాల చెల్లింపు క్యూఆర్",
    enlarge: "క్యూఆర్ పెద్దగా చూడండి",
    scan: "విరాళం కోసం స్కాన్ చేయండి",
    details: "చెల్లింపు వివరాలు",
    recipient: "గ్రహీత",
    mobile: "యూపీఐకి అనుసంధానించిన మొబైల్ నంబర్",
    instructions: "విరాళం ఎలా అందించాలి",
    steps: [
      "మీ యూపీఐ యాప్‌లో క్యూఆర్ స్కాన్ చేయండి. అదే ఫోన్‌లో అయితే చిత్రాన్ని సేవ్ చేసి, మీ యాప్‌లో సదుపాయం ఉంటే గ్యాలరీ నుంచి ఎంచుకోండి.",
      "చెల్లింపును నిర్ధారించే ముందు గ్రహీత పేరు PINNINTI DINESH అని సరిచూసుకోండి.",
      "చందా నమోదు లేదా చెల్లింపు సందేహాల కోసం పైన ఇచ్చిన నంబర్‌లో నిర్వాహకులను సంప్రదించండి.",
    ],
    note: "చందాలను నిర్వాహకులు సరిచూసి నమోదు చేస్తారు. చెల్లింపుతో చందాల జాబితా స్వయంచాలకంగా మారదు; వెబ్‌సైట్ రసీదు జారీ చేయదు.",
    save: "క్యూఆర్ చిత్రం సేవ్ చేయండి",
    close: "మూసివేయండి",
    failed:
      "క్యూఆర్ చిత్రం అందుబాటులో లేదు. పేజీని మళ్లీ తెరవండి లేదా నిర్వాహకులను సంప్రదించండి.",
    warning: "చెల్లించే ముందు మీ యూపీఐ యాప్‌లో గ్రహీత పేరు సరిచూసుకోండి.",
  },
};

export function DonationInformation({ language }: { language: Language }) {
  const copy = text[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [imageFailed, setImageFailed] = useState(false);

  function qrImage() {
    return (
      <Image
        src={donationDetails.qrImage}
        alt={copy.qr}
        width={1080}
        height={1860}
        unoptimized
        className={styles.qrImage}
        onError={() => setImageFailed(true)}
      />
    );
  }

  function details() {
    return (
      <dl className={styles.details}>
        <div>
          <dt>{copy.recipient}</dt>
          <dd>{donationDetails.recipient}</dd>
        </div>
        <div>
          <dt>{copy.mobile}</dt>
          <dd>
            <a href={`tel:${donationDetails.mobileTelephone}`}>
              {donationDetails.mobileDisplay}
            </a>
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div className={styles.donation}>
      <p className={styles.introduction}>{copy.introduction}</p>
      <div className={styles.grid}>
        <div className={styles.qrCard}>
          {imageFailed ? <p role="status">{copy.failed}</p> : qrImage()}
          {!imageFailed && (
            <div className={styles.actions}>
              <button
                ref={trigger}
                type="button"
                onClick={() => dialog.current?.showModal()}
                aria-haspopup="dialog"
              >
                <Icon name="image" />
                {copy.enlarge}
              </button>
              <a href={donationDetails.qrImage} download="Rittapadu-donation-QR.jpg">
                {copy.save}
              </a>
            </div>
          )}
        </div>
        <div className={styles.information}>
          <article className={styles.card}>
            <h3>
              <Icon name="hands" />
              {copy.details}
            </h3>
            {details()}
          </article>
          <article className={styles.card}>
            <h3>{copy.instructions}</h3>
            <ol>
              {copy.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
          <p className={styles.note}>
            <Icon name="shield" />
            {copy.note}
          </p>
        </div>
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="donation-qr-title"
        aria-describedby="donation-qr-warning"
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className={styles.modalContent}>
          <div className={styles.modalHeader}>
            <h2 id="donation-qr-title">{copy.scan}</h2>
            <button
              type="button"
              autoFocus
              onClick={() => dialog.current?.close()}
              aria-label={copy.close}
            >
              <Icon name="close" />
            </button>
          </div>
          {imageFailed ? <p role="status">{copy.failed}</p> : qrImage()}
          {details()}
          <p id="donation-qr-warning" className={styles.warning}>
            {copy.warning}
          </p>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => dialog.current?.close()}
          >
            {copy.close}
          </button>
        </div>
      </dialog>
    </div>
  );
}
