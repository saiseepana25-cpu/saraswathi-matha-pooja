import Image from "next/image";
import { committeeMembers } from "@/config/committee";
import type { Language } from "@/lib/i18n/public-copy";
import { Icon } from "./icon";
import styles from "./organising-committee.module.css";

export function OrganisingCommittee({ language }: { language: Language }) {
  const call = language === "en" ? "Call" : "కాల్ చేయండి";
  return (
    <ul className={styles.members}>
      {committeeMembers.map((member) => (
        <li key={member.telephone} className={styles.card}>
          <div className={styles.identity}>
            <span className={styles.photoFrame}>
              <Image
                src={member.photo}
                alt={member.name}
                width={240}
                height={240}
                sizes="(max-width: 700px) 88px, 160px"
                className={styles.photo}
                style={{
                  objectPosition: member.photoPosition,
                  transform: "scale(" + member.photoZoom + ")",
                  transformOrigin: member.photoPosition,
                }}
              />
            </span>
            <h3 lang="en">{member.name}</h3>
          </div>
          <a
            href={"tel:" + member.telephone}
            aria-label={call + " " + member.name + " — " + member.phone}
          >
            <Icon name="phone" />
            <span lang="en">{member.phone}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
