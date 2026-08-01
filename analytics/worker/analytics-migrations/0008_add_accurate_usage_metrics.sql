ALTER TABLE stats_configs
ADD COLUMN accurate_report_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stats_models
ADD COLUMN successful_request_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stats_models
ADD COLUMN successful_total_tokens INTEGER NOT NULL DEFAULT 0;
