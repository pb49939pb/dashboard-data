# Mobile Overview controls

At widths up to 640px, Yesterday/Today/Tomorrow are independent toggles, not jump links. They use aria-pressed and active background colors; device-local preferences live under `hl-mobile-game-days:v1`. Default: Yesterday and Today on, Tomorrow off. All days may be off, with an explicit choose-a-day message. Preferences represent relative day names and survive reloads and score refreshes. No account/database writes or extra external requests are involved.

The toggle rail stays below the main tabs while scrolling the Games card. Skip moves past the entire schedule to Today; Back to games returns to the card. This preserves normal page scrolling and full access to every enabled day's games. Alternatives for future evaluation: a favorite-team-only filter or a compact score-strip view. No nested schedule scroll area is introduced.

On phones, Today shows the question first and hides its other editorial rows behind More from Today. Desktop still shows the full edition and all game days with their original jump links. Question-of-the-day modals use consistent content padding, flexible chart columns and wrapping labels.

Verified in Chrome at 320/390/430px: defaults, persistent selections after reload, all-off feedback, sticky rail below tabs, skip destination, Today expansion, and question modal overflow. At 1280px, all three days and the full edition remain visible.
