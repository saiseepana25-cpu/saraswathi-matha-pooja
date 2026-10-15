import { venueDetails } from "@/config/venue";
import type { Language } from "@/lib/i18n/public-copy";
import { Icon } from "./icon";
import styles from "./celebration-venue.module.css";

const text = {
  en: {
    welcome: "Join our community for the Saraswathi Puja celebration in Rittapadu.",
    photoPending: "Venue photo coming soon",
    photoDescription: "A photograph of the celebration venue will be added here.",
    details: "Venue details",
    name: "Venue name",
    address: "Full address",
    landmark: "Nearby landmark",
    directions: "Get Directions",
    mapNote: "Opens the organiser-provided location in Google Maps in a new tab.",
    newTab: "opens in a new tab",
  },
  te: {
    welcome: "Rittapadu గ్రామ సరస్వతి పూజా వేడుకలకు అందరికీ స్వాగతం.",
    photoPending: "వేదిక చిత్రం త్వరలో",
    photoDescription: "ఉత్సవ వేదిక ఫోటో ఇక్కడ జోడించబడుతుంది.",
    details: "వేదిక వివరాలు",
    name: "వేదిక పేరు",
    address: "పూర్తి చిరునామా",
    landmark: "సమీప గుర్తింపు ప్రదేశం",
    directions: "మార్గదర్శకాలు పొందండి",
    mapNote:
      "నిర్వాహకులు అందించిన ప్రదేశం గూగుల్ మ్యాప్స్‌లో కొత్త ట్యాబ్‌లో తెరుచుకుంటుంది.",
    newTab: "కొత్త ట్యాబ్‌లో తెరుచుకుంటుంది",
  },
};

export function CelebrationVenue({ language }: { language: Language }) {
  const copy = text[language];
  return (
    <div className={styles.venue}>
      <p className={styles.welcome}>{copy.welcome}</p>
      <div className={styles.grid}>
        <div className={styles.photoPlaceholder}>
          <span className={styles.motif}>
            <Icon name="pin" />
          </span>
          <h3>{copy.photoPending}</h3>
          <p>{copy.photoDescription}</p>
        </div>
        <article className={styles.detailsCard}>
          <h3>
            <Icon name="pin" />
            {copy.details}
          </h3>
          <dl className={styles.facts}>
            <div>
              <dt>{copy.name}</dt>
              <dd lang="en">{venueDetails.name}</dd>
            </div>
            <div>
              <dt>{copy.landmark}</dt>
              <dd lang="en">{venueDetails.landmark}</dd>
            </div>
            <div className={styles.address}>
              <dt>{copy.address}</dt>
              <dd lang="en">{venueDetails.address}</dd>
            </div>
          </dl>
          <div className={styles.directions}>
            <a
              href={venueDetails.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.directions + " — " + copy.newTab}
            >
              <Icon name="arrow" />
              {copy.directions}
            </a>
            <p>{copy.mapNote}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
