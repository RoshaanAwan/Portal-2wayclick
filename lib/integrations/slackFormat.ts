// Turns Slack's wire-format message text into something readable in the portal's
// message pane. Slack sends:
//   • emoji as shortcodes — ":sparkles:", ":white_check_mark:"
//   • &, <, > HTML-escaped — so a quote line arrives as "&gt; …"
//   • mrkdwn links/mentions wrapped in angle brackets — "<https://…|label>",
//     "<@U123>", "<#C123|name>"
//   • *bold* / _italic_ / ~strike~ wrappers (kept as-is; the pane is plain text)
//
// This is intentionally a small curated map, not a full emoji set: it covers the
// shortcodes that actually show up in portal/Slack traffic. Unknown shortcodes
// (including a workspace's custom :emoji:) are left untouched, which is the safe
// fallback.

/** The shortcodes seen in real portal + common Slack messages. Extend freely. */
const EMOJI: Record<string, string> = {
  // status / checks
  white_check_mark: "✅",
  heavy_check_mark: "✔️",
  ballot_box_with_check: "☑️",
  x: "❌",
  warning: "⚠️",
  no_entry: "⛔",
  no_entry_sign: "🚫",
  exclamation: "❗",
  heavy_exclamation_mark: "❗",
  question: "❓",
  bangbang: "‼️",
  // sparkle / celebrate
  sparkles: "✨",
  star: "⭐",
  star2: "🌟",
  stars: "🌠",
  dizzy: "💫",
  tada: "🎉",
  confetti_ball: "🎊",
  balloon: "🎈",
  partying_face: "🥳",
  trophy: "🏆",
  medal: "🏅",
  first_place_medal: "🥇",
  // hands / gestures
  wave: "👋",
  raised_hands: "🙌",
  clap: "👏",
  pray: "🙏",
  "+1": "👍",
  thumbsup: "👍",
  "-1": "👎",
  thumbsdown: "👎",
  ok_hand: "👌",
  muscle: "💪",
  point_right: "👉",
  point_left: "👈",
  point_up: "☝️",
  point_down: "👇",
  handshake: "🤝",
  fist: "✊",
  v: "✌️",
  // faces
  smile: "😄",
  smiley: "😃",
  grinning: "😀",
  blush: "😊",
  wink: "😉",
  joy: "😂",
  rofl: "🤣",
  sunglasses: "😎",
  thinking_face: "🤔",
  thinking: "🤔",
  neutral_face: "😐",
  slightly_smiling_face: "🙂",
  sob: "😭",
  cry: "😢",
  scream: "😱",
  sweat_smile: "😅",
  raised_eyebrow: "🤨",
  eyes: "👀",
  // hearts / love
  heart: "❤️",
  hearts: "💕",
  blue_heart: "💙",
  green_heart: "💚",
  yellow_heart: "💛",
  purple_heart: "💜",
  orange_heart: "🧡",
  black_heart: "🖤",
  white_heart: "🤍",
  sparkling_heart: "💖",
  // objects / work
  fire: "🔥",
  rocket: "🚀",
  bulb: "💡",
  zap: "⚡",
  boom: "💥",
  100: "💯",
  memo: "📝",
  pencil: "✏️",
  pencil2: "✏️",
  clipboard: "📋",
  pushpin: "📌",
  round_pushpin: "📍",
  paperclip: "📎",
  calendar: "📅",
  date: "📆",
  alarm_clock: "⏰",
  hourglass: "⌛",
  hourglass_flowing_sand: "⏳",
  watch: "⌚",
  bell: "🔔",
  no_bell: "🔕",
  loudspeaker: "📢",
  mega: "📣",
  email: "📧",
  envelope: "✉️",
  inbox_tray: "📥",
  outbox_tray: "📤",
  package: "📦",
  link: "🔗",
  lock: "🔒",
  unlock: "🔓",
  key: "🔑",
  mag: "🔍",
  gear: "⚙️",
  hammer: "🔨",
  wrench: "🔧",
  hammer_and_wrench: "🛠️",
  chart_with_upwards_trend: "📈",
  chart_with_downwards_trend: "📉",
  bar_chart: "📊",
  moneybag: "💰",
  dollar: "💵",
  credit_card: "💳",
  briefcase: "💼",
  office: "🏢",
  computer: "💻",
  desktop_computer: "🖥️",
  iphone: "📱",
  phone: "☎️",
  telephone: "☎️",
  coffee: "☕",
  tea: "🍵",
  pizza: "🍕",
  hamburger: "🍔",
  birthday: "🎂",
  cake: "🍰",
  beers: "🍻",
  beer: "🍺",
  // nature / time
  sun_with_face: "🌞",
  sunny: "☀️",
  partly_sunny: "⛅",
  cloud: "☁️",
  rainbow: "🌈",
  snowflake: "❄️",
  snowman: "⛄",
  ocean: "🌊",
  palm_tree: "🌴",
  deciduous_tree: "🌳",
  evergreen_tree: "🌲",
  herb: "🌿",
  four_leaf_clover: "🍀",
  seedling: "🌱",
  cherry_blossom: "🌸",
  rose: "🌹",
  sunflower: "🌻",
  tulip: "🌷",
  bouquet: "💐",
  // misc
  flag: "🚩",
  checkered_flag: "🏁",
  white_flag: "🏳️",
  bullseye: "🎯",
  dart: "🎯",
  hot_pepper: "🌶️",
  smiling_imp: "😈",
  ghost: "👻",
  robot_face: "🤖",
  robot: "🤖",
  poop: "💩",
  hankey: "💩",
  skull: "💀",
  alien: "👽",
  see_no_evil: "🙈",
  hear_no_evil: "🙉",
  speak_no_evil: "🙊",
  crown: "👑",
  gem: "💎",
  ring: "💍",
  gift: "🎁",
  heavy_plus_sign: "➕",
  heavy_minus_sign: "➖",
  arrow_right: "➡️",
  arrow_left: "⬅️",
  arrow_up: "⬆️",
  arrow_down: "⬇️",
  recycle: "♻️",
  white_check: "✅",
};

/** Decode the three entities Slack escapes in message text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Unwrap Slack mrkdwn angle-bracket spans:
 *   <https://x|label>  → label
 *   <https://x>        → https://x
 *   <#C123|general>    → #general
 *   <@U123>            → @U123 (no name available here; kept as a stable token)
 *   <!here> / <!channel> → @here / @channel
 * Must run BEFORE decodeEntities, since Slack escapes the surrounding <,> too —
 * but conversations.history delivers these angle brackets literally, not escaped,
 * so we match real "<…>" here and let decodeEntities handle the rest.
 */
function unwrapSpans(s: string): string {
  return s.replace(/<([^<>]+)>/g, (_m, inner: string) => {
    if (inner.startsWith("!")) {
      const cmd = inner.slice(1).split("|")[0];
      return "@" + cmd; // <!here> → @here
    }
    const [target, label] = inner.split("|");
    if (target.startsWith("#")) return "#" + (label ?? target.slice(1));
    if (target.startsWith("@")) return "@" + (label ?? target.slice(1));
    return label ?? target; // links: prefer the human label
  });
}

/** Replace :shortcode: tokens with Unicode emoji; unknown ones pass through. */
function replaceEmoji(s: string): string {
  // skin-tone modifiers (":wave::skin-tone-3:") — drop the modifier, keep base.
  const cleaned = s.replace(/::skin-tone-\d:/g, ":");
  return cleaned.replace(/:([a-z0-9_+-]+):/gi, (whole, name: string) => {
    return EMOJI[name.toLowerCase()] ?? whole;
  });
}

/**
 * Format one Slack message body for display: unwrap link/mention spans, decode
 * HTML entities, then swap emoji shortcodes. Plain text in → readable text out.
 */
export function formatSlackText(text: string): string {
  if (!text) return "";
  return replaceEmoji(decodeEntities(unwrapSpans(text)));
}
