'use strict';
const humanInterval = require('human-interval');
const { CronTime } = require('cron');
const moment = require('moment-timezone');
const date = require('date.js');
const debug = require('debug')('agenda:job');
const RRule = require('rrule').RRule;
const TimeZoneDate = RRule.enableTimezones()

/**
 * Internal method used to compute next time a job should run and sets the proper values
 * @name Job#computeNextRunAt
 * @function
 * @returns {exports} instance of Job instance
 */
module.exports = function () {
  const data = this.attrs.data;
  const timeZoneName = data.timeZoneName;
  const interval = this.attrs.repeatInterval;
  const timezone = this.attrs.repeatTimezone;
  const { repeatAt } = this.attrs;
  const previousNextRunAt = this.attrs.nextRunAt || new Date();
  this.attrs.nextRunAt = undefined;

  const dateForTimezone = date => {
    date = moment(date);
    if (timezone !== null) {
      date.tz(timezone);
    }

    return date;
  };

  /**
   * Internal method that computes the interval
   * @returns {undefined}
   */
  const computeFromInterval = () => {

    debug('[%s:%s] computing next run via interval [%s]', this.attrs.name, this.attrs._id, interval);
    let lastRun = this.attrs.lastRunAt || new Date();
    //lastRun = dateForTimezone(lastRun);
    lastRun = new TimeZoneDate(lastRun, timeZoneName);
    try {
      const cronTime = new CronTime(interval);
      let nextDate = cronTime._getNextDateFrom(lastRun);
      if (nextDate.valueOf() === lastRun.valueOf() || nextDate.valueOf() <= previousNextRunAt.valueOf()) {
        // Handle cronTime giving back the same date for the next run time
        nextDate = cronTime._getNextDateFrom(dateForTimezone(new Date(lastRun.valueOf() + 1000)));
      }

      this.attrs.nextRunAt = nextDate;
      debug('[%s:%s] nextRunAt set to [%s]', this.attrs.name, this.attrs._id, new Date(this.attrs.nextRunAt).toISOString());
      // Either `xo` linter or Node.js 8 stumble on this line if it isn't just ignored
    } catch (error) { // eslint-disable-line no-unused-vars
      // Nope, humanInterval then!
      try {
        if (!this.attrs.lastRunAt && humanInterval(interval)) {
          this.attrs.nextRunAt = lastRun.valueOf();
          debug('[%s:%s] nextRunAt set to [%s]', this.attrs.name, this.attrs._id, new Date(this.attrs.nextRunAt).toISOString());
        } else {
          this.attrs.nextRunAt = lastRun.valueOf() + humanInterval(interval);
          debug('[%s:%s] nextRunAt set to [%s]', this.attrs.name, this.attrs._id, new Date(this.attrs.nextRunAt).toISOString());
        }
        // Either `xo` linter or Node.js 8 stumble on this line if it isn't just ignored
      } catch (error) {
        // Nope, rrule then!

        try {
          var options = RRule.parseString(interval);

          if (typeof timeZoneName != "undefined" && timeZoneName != "" && timeZoneName != null) {
            options.timezone = timeZoneName;

            var start = new TimeZoneDate(this.attrs.startRunsAt, timeZoneName);
            options.dtstart = start;

            if (!__util.isNullOrEmpty(options.byhour) && !__util.isNullOrEmpty(data.tzOffsetInMins)) {
              var h = start.getHours();
              var m = start.getMinutes();

              options.byhour = start.getHours();
              options.byminute = start.getMinutes();
            }

          } else {
            options.dtstart = new Date(this.attrs.startRunsAt);

            if (!__util.isNullOrEmpty(options.byhour) && !__util.isNullOrEmpty(data.tzOffsetInMins)) {

              if (!__util.isNullOrEmpty(data.triggerTime)) {
                var startTime = new Date(data.triggerTime);

                options.byhour = startTime.getHours();
                options.byminute = startTime.getMinutes();
              }
            }
          }

          if (!__util.isNullOrEmpty(options.count)) {
            options.count = options.count + 1;
          }

          if (__util.isNullOrEmpty(options.count) && __util.isNullOrEmpty(options.until)) {
            options.count = 500 + 1;
          }

          var rule = new RRule(options);
          this.attrs.intervalAll = rule.all();
          var lastDate = this.attrs.intervalAll[this.attrs.intervalAll.length - 2];

          this.attrs.noMoreAt = new Date(lastDate);
          var nextDate = rule.after((lastRun));

          /* if (typeof timeZoneName != "undefined" && timeZoneName != "" && timeZoneName != null) {
             console.dir(rule.all())
   
             console.dir('---------------------------------next run ---------------------------------')
             console.dir(nextDate)
           }*/

          if (nextDate != null && nextDate.valueOf() === (lastRun).valueOf()) {
            nextDate = rule.after((lastRun.valueOf() + 1000));
          } else {
            if (nextDate != null && this.attrs.noMoreAt.valueOf() === nextDate.valueOf()) {
              nextDate = ((this.attrs.noMoreAt.valueOf()));
            }
          }

          this.attrs.nextRunAt = dateForTimezone(nextDate);

        } catch (e) {
          //console.dir('rrule : ' + e);
        }

      } // eslint-disable-line no-unused-vars
    } finally {
      if (isNaN(this.attrs.nextRunAt)) {
        this.attrs.nextRunAt = undefined;
        debug('[%s:%s] failed to calculate nextRunAt due to invalid repeat interval', this.attrs.name, this.attrs._id);
        this.fail('failed to calculate nextRunAt due to invalid repeat interval');
      } else {
        // startDate and endDate...
        var _startsRun = (this.attrs.startRunsAt === undefined || this.attrs.startRunsAt === null) ? null : new Date(this.attrs.startRunsAt).valueOf();
        var _endsRun = (this.attrs.noMoreAt === null) ? null : new Date(this.attrs.noMoreAt).valueOf();
        var _nextRun = (this.attrs.nextRunAt === undefined || this.attrs.nextRunAt === null) ? null : new Date(this.attrs.nextRunAt).valueOf();
        var nxtDate = null;

        if (!_endsRun && !_startsRun) {// no start and end date
          nxtDate = _nextRun;
          //console.dir('--------------c1----------------------------------------------------------')
        } else if (_nextRun != null && !_endsRun && _startsRun) {// only start date
          //console.dir('--------------c2----------------------------------------------------------')
          nxtDate = (_nextRun < _startsRun) ? _startsRun : _nextRun;
        } else if (_nextRun != null && _endsRun && !_startsRun) {// only end date
          //console.dir('--------------c3----------------------------------------------------------')
          nxtDate = (_nextRun > _endsRun) ? null : _nextRun;
        } else if (_nextRun != null && _nextRun < _startsRun) {// both start and end date
          //console.dir('--------------c4----------------------------------------------------------' + _nextRun + _startsRun)
          nxtDate = _startsRun;
        } else if (_nextRun != null && _nextRun > _endsRun) {// both start and end date
          //console.dir('--------------c5----------------------------------------------------------')
          nxtDate = null;
        } else {
          if (_nextRun != null && _endsRun >= _nextRun) {
            nxtDate = _nextRun;
          } else {
            nxtDate = null;
          }

          //console.dir('--------------c6 else----------------------------------------------------------' + nxtDate)
        }

        if (nxtDate != null) {
          this.attrs.nextRunAt = dateForTimezone(nxtDate)
        } else {
          this.attrs.nextRunAt = undefined;
        }
       // console.dir('--------------finally----------------------------------------------------------' + this.attrs.nextRunAt)

        debug('[%s:%s] nextRunAt set to [%s]', this.attrs.name, this.attrs._id, this.attrs.nextRunAt);
      }
    }
  };

  /**
   * Internal method to compute next run time from the repeat string
   * @returns {undefined}
   */
  function computeFromRepeatAt() {
    const lastRun = this.attrs.lastRunAt || new Date();
    const nextDate = date(repeatAt).valueOf();

    // If you do not specify offset date for below test it will fail for ms
    const offset = Date.now();
    if (offset === date(repeatAt, offset).valueOf()) {
      this.attrs.nextRunAt = undefined;
      debug('[%s:%s] failed to calculate repeatAt due to invalid format', this.attrs.name, this.attrs._id);
      this.fail('failed to calculate repeatAt time due to invalid format');
    } else if (nextDate.valueOf() === lastRun.valueOf()) {
      this.attrs.nextRunAt = date('tomorrow at ', repeatAt);
      debug('[%s:%s] nextRunAt set to [%s]', this.attrs.name, this.attrs._id, this.attrs.nextRunAt.toISOString());
    } else {
      this.attrs.nextRunAt = date(repeatAt);
      debug('[%s:%s] nextRunAt set to [%s]', this.attrs.name, this.attrs._id, this.attrs.nextRunAt.toISOString());
    }
  }

  if (interval) {
    computeFromInterval.call(this);
  } else if (repeatAt) {
    computeFromRepeatAt.call(this);
  }

  return this;
};
