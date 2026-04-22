-- OI-0133: groups.farm_id dropped. Group's current farm is derived at
-- read time from the latest open event_group_window → event.farm_id via
-- getGroupCurrentFarm() in src/data/store.js. Matches the OI-0117
-- precedent (drop stored copies of derivable facts).
ALTER TABLE groups DROP COLUMN farm_id;

UPDATE operations SET schema_version = 32;
