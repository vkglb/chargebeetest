package billing

import "time"

// DefaultRetrySchedule mirrors a Chargebee-style custom dunning schedule: retry
// on days 1, 3, and 5 after the first failure, then give up. Configurable per
// merchant later; this is the v1 default.
var DefaultRetrySchedule = []int{1, 3, 5}

// NextDunningTime returns the scheduled time for the given retry attempt
// (1-based) relative to firstFailure, and whether another attempt exists.
//
// attemptNo 1 → firstFailure + schedule[0] days, etc. When attemptNo exceeds the
// schedule length, ok is false and dunning is exhausted (cancel the subscription).
func NextDunningTime(firstFailure time.Time, attemptNo int, schedule []int) (when time.Time, ok bool) {
	if len(schedule) == 0 {
		schedule = DefaultRetrySchedule
	}
	idx := attemptNo - 1
	if idx < 0 || idx >= len(schedule) {
		return time.Time{}, false
	}
	return firstFailure.AddDate(0, 0, schedule[idx]), true
}

// IsDunningExhausted reports whether all retry attempts have been used.
func IsDunningExhausted(attemptNo int, schedule []int) bool {
	if len(schedule) == 0 {
		schedule = DefaultRetrySchedule
	}
	return attemptNo > len(schedule)
}
