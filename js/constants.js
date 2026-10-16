export const GOAL_HISTORY_DAYS = 365;
export const GPS_WEAK_SIGNAL_TIMEOUT_MS = 30_000;
export const GPS_MAX_POINT_JUMP_KM = 0.5;
export const MIN_RUN_FINISH_DIST_KM = 0.05;
// Calories per pound of body-weight change. 3500 (roughly a pound of fat) is only the
// default: once there's enough bulk/cut history, learnKcalPerLb() (utils/tdee-calc.js)
// fits the user's own value and stores it as the 'kcal_per_lb' setting.
export const KCAL_PER_LB_FAT = 3500;
// Physical limits for the learned value: lean tissue/glycogen (~1000) to pure fat (~4300)
export const KCAL_PER_LB_MIN = 1000;
export const KCAL_PER_LB_MAX = 4300;
// Target-weight mode closes the remaining gap over this many weeks (never faster than the max rate)
export const TARGET_CLOSE_WEEKS = 6;
export const MACRO_INTENSITY_LOW_G = 5;
export const MACRO_INTENSITY_HIGH_G = 10;
