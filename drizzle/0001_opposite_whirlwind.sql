CREATE TABLE `antivirus_scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`filename` varchar(160) NOT NULL,
	`sha256` varchar(64),
	`status` enum('clean','infected','error','timeout','pending') NOT NULL,
	`malwareName` varchar(255),
	`detail` text,
	`engine` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `antivirus_scans_id` PRIMARY KEY(`id`)
);
