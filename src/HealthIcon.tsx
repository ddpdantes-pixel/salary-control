import type { ReactNode } from 'react'

export type HealthIconName =
  | 'calendar'
  | 'history'
  | 'settings'
  | 'droplet'
  | 'coffee'
  | 'checklist'
  | 'dumbbell'
  | 'image'
  | 'wind'
  | 'pulse'
  | 'chart'
  | 'bottle'
  | 'wine'
  | 'book'
  | 'clipboard'
  | 'sparkles'
  | 'timer'

export function HealthIcon({ name }: { name: HealthIconName }) {
  const paths: ReactNode = name === 'calendar'
    ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>
    : name === 'history'
      ? <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 7v5l3 2" /></>
      : name === 'settings'
        ? <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05-2.1 2.1-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56v.08h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.05.05-2.1-2.1.05-.05A1.7 1.7 0 0 0 7.04 15 1.7 1.7 0 0 0 5.48 14H5.4v-3h.08A1.7 1.7 0 0 0 7.04 9.96 1.7 1.7 0 0 0 6.7 8.08l-.05-.05 2.1-2.1.05.05a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56V4.7h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.05-.05 2.1 2.1-.05.05a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>
        : name === 'droplet'
          ? <path d="M12 3s6 6.2 6 10.2a6 6 0 0 1-12 0C6 9.2 12 3 12 3Z" />
          : name === 'coffee'
            ? <><path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" /><path d="M16 10h2a2 2 0 0 1 0 4h-2M7 4h8" /></>
            : name === 'checklist'
              ? <><path d="m5 7 1.5 1.5L9 5.5M11 7h8M5 13l1.5 1.5L9 11.5M11 13h8M5 19l1.5 1.5L9 17.5M11 19h8" /></>
              : name === 'dumbbell'
                ? <><path d="M5 9v6M8 7v10M16 7v10M19 9v6M8 10h8" /><path d="M5 11h3M16 11h3" /></>
                : name === 'image'
                  ? <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4.5-4 3 2.5 2.5-3 4 4.5" /></>
                  : name === 'wind'
                    ? <><path d="M4 9h10a2 2 0 1 0-2-2M4 13h14a2 2 0 1 1-2 2M4 17h7" /></>
                    : name === 'pulse'
                      ? <path d="M3 12h4l2-5 4 10 2-5h6" />
                      : name === 'chart'
                        ? <><path d="M5 19V5M5 19h14" /><path d="m8 15 3-3 2 2 4-5" /></>
                        : name === 'bottle'
                          ? <><path d="M10 3h4v4l3 3v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8l3-3Z" /><path d="M8 12h8" /></>
                          : name === 'wine'
                            ? <><path d="M7 3h10v3a5 5 0 0 1-10 0Z" /><path d="M12 11v7M8 21h8" /></>
                            : name === 'book'
                              ? <><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h4v17H7a2.5 2.5 0 0 0-2.5 2Z" /><path d="M19.5 5.5A2.5 2.5 0 0 0 17 3h-4v17h4a2.5 2.5 0 0 1 2.5 2Z" /></>
                              : name === 'clipboard'
                                ? <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M9 11h6M9 15h4" /></>
                                : name === 'sparkles'
                                  ? <><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.3L12 14.5l-1.3-4.2L6.5 9l4.2-1.3ZM19 15l.6 1.9 1.9.6-1.9.6L19 20l-.6-1.9-1.9-.6 1.9-.6ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8Z" /></>
                                  : <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>

  return <svg className="health-icon" data-health-icon={name} viewBox="0 0 24 24" aria-hidden="true">{paths}</svg>
}
