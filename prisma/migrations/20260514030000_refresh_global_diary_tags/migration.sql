-- Refresh global default diary tag colors and add broader event/emotion tags.
-- Baby-scoped custom tags are intentionally untouched.

WITH tag_colors("type", "name", "color") AS (
	VALUES
		-- Milestones: bright, positive colors.
		('milestone', 'first smile', '#F59E0B'),
		('milestone', 'first laugh', '#F97316'),
		('milestone', 'first solid food', '#FB923C'),
		('milestone', 'first flip-over', '#EC4899'),
		('milestone', 'first crawl', '#FBBF24'),
		('milestone', 'first walk', '#FACC15'),
		('milestone', 'first coo', '#A855F7'),
		('milestone', 'first babble', '#8B5CF6'),
		('milestone', 'first word', '#6366F1'),
		('milestone', 'first clap', '#F472B6'),
		('milestone', 'first wave', '#22C55E'),
		('milestone', 'first roll back to tummy', '#FB7185'),
		('milestone', 'first roll tummy to back', '#F43F5E'),
		('milestone', 'first sit unsupported', '#14B8A6'),
		('milestone', 'first stand', '#F59E0B'),
		('milestone', 'first steps', '#EAB308'),
		('milestone', 'first tooth', '#06B6D4'),
		('milestone', 'first bottle', '#A78BFA'),
		('milestone', 'first spoon feeding', '#FB923C'),
		('milestone', 'first full night sleep', '#60A5FA'),
		('milestone', 'first daycare day', '#34D399'),
		('milestone', 'first birthday', '#F472B6'),

		-- Events: varied contextual colors.
		('event', 'doctor visit', '#38BDF8'),
		('event', 'family visit', '#34D399'),
		('event', 'outing', '#22C55E'),
		('event', 'trip', '#818CF8'),
		('event', 'playdate', '#F472B6'),
		('event', 'daycare', '#2DD4BF'),
		('event', 'park', '#84CC16'),
		('event', 'photoshoot', '#A78BFA'),
		('event', 'holiday', '#F43F5E'),
		('event', 'birthday party', '#FB7185'),
		('event', 'family gathering', '#F97316'),
		('event', 'travel day', '#60A5FA'),
		('event', 'vaccination', '#06B6D4'),
		('event', 'checkup', '#38BDF8'),
		('event', 'sick day', '#94A3B8'),
		('event', 'shopping', '#F59E0B'),
		('event', 'restaurant', '#FB923C'),
		('event', 'library', '#8B5CF6'),
		('event', 'class', '#6366F1'),
		('event', 'swim', '#0EA5E9'),
		('event', 'outdoor play', '#22C55E'),
		('event', 'home day', '#14B8A6'),

		-- Emotions and baby states.
		('emotion', 'happy', '#FBBF24'),
		('emotion', 'excited', '#F97316'),
		('emotion', 'calm', '#2DD4BF'),
		('emotion', 'curious', '#38BDF8'),
		('emotion', 'playful', '#F472B6'),
		('emotion', 'proud', '#F59E0B'),
		('emotion', 'sleepy', '#60A5FA'),
		('emotion', 'tired', '#818CF8'),
		('emotion', 'sad', '#64748B'),
		('emotion', 'upset', '#F87171'),
		('emotion', 'fussy', '#FB7185'),
		('emotion', 'overstimulated', '#A855F7'),
		('emotion', 'hungry', '#FB923C'),
		('emotion', 'content', '#34D399'),
		('emotion', 'shy', '#C084FC'),
		('emotion', 'brave', '#22C55E'),
		('emotion', 'silly', '#EC4899'),
		('emotion', 'snuggly', '#14B8A6')
)
UPDATE "tags" AS existing
SET
	"color" = tag_colors."color",
	"updated_at" = CURRENT_TIMESTAMP
FROM tag_colors
WHERE
	existing."baby_id" IS NULL
	AND existing."type" = tag_colors."type"
	AND existing."name" = tag_colors."name";

INSERT INTO "tags" ("id", "baby_id", "type", "name", "color", "created_at", "updated_at")
VALUES
	-- New event tags.
	('11111111-1111-4111-8111-111111111205', NULL, 'event', 'playdate', '#F472B6', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111206', NULL, 'event', 'daycare', '#2DD4BF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111207', NULL, 'event', 'park', '#84CC16', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111208', NULL, 'event', 'photoshoot', '#A78BFA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111209', NULL, 'event', 'holiday', '#F43F5E', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111210', NULL, 'event', 'birthday party', '#FB7185', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111211', NULL, 'event', 'family gathering', '#F97316', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111212', NULL, 'event', 'travel day', '#60A5FA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111213', NULL, 'event', 'vaccination', '#06B6D4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111214', NULL, 'event', 'checkup', '#38BDF8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111215', NULL, 'event', 'sick day', '#94A3B8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111216', NULL, 'event', 'shopping', '#F59E0B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111217', NULL, 'event', 'restaurant', '#FB923C', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111218', NULL, 'event', 'library', '#8B5CF6', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111219', NULL, 'event', 'class', '#6366F1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111220', NULL, 'event', 'swim', '#0EA5E9', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111221', NULL, 'event', 'outdoor play', '#22C55E', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111222', NULL, 'event', 'home day', '#14B8A6', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

	-- New emotion tags.
	('11111111-1111-4111-8111-111111111301', NULL, 'emotion', 'happy', '#FBBF24', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111302', NULL, 'emotion', 'excited', '#F97316', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111303', NULL, 'emotion', 'calm', '#2DD4BF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111304', NULL, 'emotion', 'curious', '#38BDF8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111305', NULL, 'emotion', 'playful', '#F472B6', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111306', NULL, 'emotion', 'proud', '#F59E0B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111307', NULL, 'emotion', 'sleepy', '#60A5FA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111308', NULL, 'emotion', 'tired', '#818CF8', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111309', NULL, 'emotion', 'sad', '#64748B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111310', NULL, 'emotion', 'upset', '#F87171', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111311', NULL, 'emotion', 'fussy', '#FB7185', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111312', NULL, 'emotion', 'overstimulated', '#A855F7', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111313', NULL, 'emotion', 'hungry', '#FB923C', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111314', NULL, 'emotion', 'content', '#34D399', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111315', NULL, 'emotion', 'shy', '#C084FC', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111316', NULL, 'emotion', 'brave', '#22C55E', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111317', NULL, 'emotion', 'silly', '#EC4899', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
	('11111111-1111-4111-8111-111111111318', NULL, 'emotion', 'snuggly', '#14B8A6', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
