CREATE TABLE `antivirus_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`tokenPrefix` varchar(24) NOT NULL,
	`sessionFingerprint` varchar(128) NOT NULL,
	`projectBaseUrl` varchar(512) NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	`revokedAt` timestamp,
	CONSTRAINT `antivirus_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `antivirus_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
