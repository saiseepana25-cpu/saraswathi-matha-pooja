import type { SVGProps } from "react";

export type IconName =
  | "phone"
  | "lotus"
  | "calendar"
  | "book"
  | "hands"
  | "pin"
  | "image"
  | "users"
  | "arrow"
  | "arrowUp"
  | "pause"
  | "play"
  | "lock"
  | "close"
  | "search"
  | "more"
  | "sparkles"
  | "bowl"
  | "shield"
  | "chevron";

const paths: Record<IconName, React.ReactNode> = {
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z" />
  ),
  lotus: (
    <>
      <path d="M12 21C6 20 3 16 3 10c4 0 7 2 9 6 2-4 5-6 9-6 0 6-3 10-9 11Z" />
      <path d="M12 16C8 12 8 7 12 3c4 4 4 9 0 13Z" />
      <path d="M6 7 4 5M18 7l2-2M12 1V0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3M7 18h3" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1Zm0 0v16M6 8l3 1M15 9l3-1" />
    </>
  ),
  hands: (
    <>
      <path d="m3 13 4-4 5 2 5-2 4 4M2 13l6 7h8l6-7M8 14l3 3 5-5M12 6V3M8 6 6 4M16 6l2-2" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 6-6 4 4 3-3 5 5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowUp: <path d="M12 20V4m-6 6 6-6 6 6" />,
  pause: (
    <>
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8V4Z" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM21 2v4M19 4h4" />
    </>
  ),
  bowl: (
    <>
      <path d="M3 12h18c0 5-3 8-9 8s-9-3-9-8ZM8 3c-3 3 3 3 0 6M15 3c-3 3 3 3 0 6M7 22h10" />
    </>
  ),
  shield: (
    <>
      <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  chevron: <path d="m8 5 7 7-7 7" />,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
