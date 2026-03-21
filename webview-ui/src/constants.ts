import type { FloorColor } from './office/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;
export const SEAT_REST_MIN_SEC = 120.0;
export const SEAT_REST_MAX_SEC = 240.0;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 16;
export const MATRIX_SPRITE_ROWS = 24;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 24;
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)';
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)';
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)';
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const ZOOM_SCROLL_THRESHOLD = 50;
export const PAN_MARGIN_FRACTION = 0.25;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
export const LAYOUT_SAVE_DEBOUNCE_MS = 500;
export const DEFAULT_FLOOR_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: FloorColor = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: FloorColor = { h: 0, s: 0, b: 0, c: 0 };

// ── Notification Sound ──────────────────────────────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25; // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51; // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0;
export const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export const NOTIFICATION_VOLUME = 0.14;

// ── Furniture Animation ─────────────────────────────────────
export const FURNITURE_ANIM_INTERVAL_SEC = 0.2;

// ── Display / Text ───────────────────────────────────────────
/** Maximum length for flavor text in thought bubbles and activity feed */
export const FLAVOR_TEXT_MAX_LENGTH = 40;
/** Maximum number of entries to keep in the activity feed */
export const MAX_FEED_ENTRIES = 40;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const WAITING_BUBBLE_DURATION_SEC = 2.0;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0;
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0;
export const PALETTE_COUNT = 6;
export const HUE_SHIFT_MIN_DEG = 45;
export const HUE_SHIFT_RANGE_DEG = 271;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 8;
export const CHARACTER_HIT_HEIGHT = 24;
export const TOOL_OVERLAY_VERTICAL_OFFSET = 32;
export const PULSE_ANIMATION_DURATION_SEC = 1.5;

// ── Social Reactions ─────────────────────────────────────────────────────────
export const REACTION_SPAWN_RADIUS_TILES = 5;
export const REACTION_CLOSE_RADIUS_TILES = 5;
export const REACTION_PERMISSION_RADIUS_TILES = 4;
export const REACTION_EMOTE_DURATION_SEC = 2;
export const REACTION_BUBBLE_DURATION_SEC = 2.5;
export const REACTION_PERMISSION_DURATION_SEC = 3;
export const REACTION_COMPLETION_TOOL_THRESHOLD = 3;
export const REACTION_COMPLETION_EMOTE_DURATION_SEC = 2;

// ── Looking Busy ─────────────────────────────────────────────────────────────
export const LOOKING_BUSY_PHRASE_MIN_SEC = 8;
export const LOOKING_BUSY_PHRASE_MAX_SEC = 15;
export const LOOKING_BUSY_PHRASE_DISPLAY_SEC = 3;
export const LOOKING_BUSY_GLANCE_MIN_SEC = 5;
export const LOOKING_BUSY_GLANCE_MAX_SEC = 12;
export const LOOKING_BUSY_GLANCE_DURATION_SEC = 1.5;

// ── Time of Day Ambiance ─────────────────────────────────────────────────────
export const TIME_SAMPLE_INTERVAL_SEC = 60; // how often to re-sample current time
export const AMBIENT_TINT_LERP_SPEED = 2.0; // opacity lerp speed per second
export const SPAWN_GREETING_DELAY_SEC = 1.5; // delay after spawn effect ends before showing greeting
export const SPAWN_GREETING_DISPLAY_SEC = 4; // how long spawn greeting stays visible

// ── Water Cooler / Break Spots ────────────────────────────────────────────────
export const WATER_COOLER_VISIT_CHANCE = 0.15; // probability per wander decision
export const WATER_COOLER_BREAK_MIN_SEC = 5; // min time at break spot
export const WATER_COOLER_BREAK_MAX_SEC = 12; // max time at break spot
export const WATER_COOLER_PHRASE_DISPLAY_SEC = 3.5; // how long phrase bubble stays
export const WATER_COOLER_BREAK_SPOT_GROUPS = new Set([
  'SOFA',
  'CUSHIONED_BENCH',
  'WOODEN_BENCH',
  'COFFEE_TABLE',
  'SMALL_TABLE',
]);

// ── Office Events ─────────────────────────────────────────────────────────────
export const OFFICE_EVENT_INTERVAL_MIN_SEC = 30; // TEMP: 30s for testing (restore to 600)
export const OFFICE_EVENT_INTERVAL_MAX_SEC = 60; // TEMP: 60s for testing (restore to 1200)
export const OFFICE_EVENT_EMOTE_DURATION_SEC = 2.5;
export const OFFICE_EVENT_PHRASE_DURATION_SEC = 4;

// ── Idle Chatter ─────────────────────────────────────────────────────────────
export const IDLE_CHATTER_FIRST_DELAY_MIN_SEC = 15;
export const IDLE_CHATTER_FIRST_DELAY_MAX_SEC = 45;
export const IDLE_CHATTER_INTERVAL_MIN_SEC = 30;
export const IDLE_CHATTER_INTERVAL_MAX_SEC = 60;
export const IDLE_CHATTER_DISPLAY_SEC = 5;
// Chatter bubble colors (warmer than activityText thought bubble)
export const CHATTER_BUBBLE_BG = 'rgba(22, 14, 10, 0.92)';
export const CHATTER_BUBBLE_BORDER = '#5c4a3a';
