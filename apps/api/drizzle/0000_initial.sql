-- Hand-reviewed initial schema. Apply only to an empty database.
CREATE TYPE role AS ENUM ('member', 'moderator', 'admin', 'platform_admin');
CREATE TYPE grow_type AS ENUM ('Sativa', 'Indica', 'Hybrid');
CREATE TYPE condition AS ENUM ('Neu', 'Wie neu', 'Gebraucht');
CREATE TYPE notif_type AS ENUM ('grow', 'task', 'forum', 'shop', 'ai', 'system');
CREATE TYPE member_role AS ENUM ('member', 'moderator', 'admin');
--> statement-breakpoint
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
  password_hash text NOT NULL, name text NOT NULL, handle text NOT NULL UNIQUE,
  avatar_url text, level integer NOT NULL DEFAULT 1, title text NOT NULL DEFAULT 'Grower',
  telegram boolean NOT NULL DEFAULT false, role role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE breeders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, location text NOT NULL,
  founded integer NOT NULL, rating double precision NOT NULL DEFAULT 0, strains_count integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false, logo_color text NOT NULL DEFAULT 'leaf', bio text NOT NULL DEFAULT '', avatar_url text
);
CREATE TABLE strains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, breeder_name text NOT NULL,
  breeder_id uuid REFERENCES breeders(id), type grow_type NOT NULL DEFAULT 'Hybrid',
  thc double precision NOT NULL DEFAULT 0, cbd double precision NOT NULL DEFAULT 0,
  flowering integer NOT NULL DEFAULT 0, yield_range text NOT NULL DEFAULT '', difficulty integer NOT NULL DEFAULT 1,
  rating double precision NOT NULL DEFAULT 0, reviews integer NOT NULL DEFAULT 0, price integer NOT NULL DEFAULT 0,
  tag text NOT NULL DEFAULT '', color text NOT NULL DEFAULT 'leaf', notes text NOT NULL DEFAULT '', effects jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, category text NOT NULL, brand text NOT NULL,
  price integer NOT NULL DEFAULT 0, rating double precision NOT NULL DEFAULT 0, reviews integer NOT NULL DEFAULT 0,
  condition condition NOT NULL DEFAULT 'Neu', image text NOT NULL DEFAULT 'leaf'
);
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), strain text NOT NULL, breeder text NOT NULL, shop text NOT NULL,
  price integer NOT NULL DEFAULT 0, old_price integer, type grow_type NOT NULL DEFAULT 'Hybrid', fem boolean NOT NULL DEFAULT true
);
CREATE TABLE hall_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, grower text NOT NULL, avatar_url text,
  strain text NOT NULL, image_url text NOT NULL, award text NOT NULL DEFAULT '', likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0, aspect text NOT NULL DEFAULT 'aspect-square'
);
CREATE TABLE wiki_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, category text NOT NULL,
  excerpt text NOT NULL DEFAULT '', body jsonb NOT NULL DEFAULT '[]', author text NOT NULL,
  version text NOT NULL DEFAULT 'v1.0', read_min integer NOT NULL DEFAULT 3, tags jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE grows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
  strain_id uuid REFERENCES strains(id), breeder text NOT NULL DEFAULT '', type grow_type NOT NULL DEFAULT 'Hybrid',
  medium text NOT NULL DEFAULT '', start_date date NOT NULL, day integer NOT NULL DEFAULT 0,
  total_days integer NOT NULL DEFAULT 84, phase text NOT NULL DEFAULT 'Keimung', phase_index integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0, health integer NOT NULL DEFAULT 100, cover_url text,
  expected_yield text NOT NULL DEFAULT '—', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE grow_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grow_id uuid NOT NULL REFERENCES grows(id), day integer NOT NULL DEFAULT 0,
  date text NOT NULL DEFAULT 'heute', title text NOT NULL, body text NOT NULL DEFAULT '', tag text NOT NULL DEFAULT 'Beobachtung',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE grow_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grow_id uuid NOT NULL REFERENCES grows(id), url text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE grow_env (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grow_id uuid NOT NULL REFERENCES grows(id), day integer NOT NULL,
  temp double precision NOT NULL DEFAULT 0, rh double precision NOT NULL DEFAULT 0,
  vpd double precision NOT NULL DEFAULT 0, ec double precision NOT NULL DEFAULT 0
);
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), text text NOT NULL,
  image_url text, tags jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES posts(id), user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX post_likes_uq ON post_likes(post_id, user_id);
CREATE TABLE post_bookmarks (post_id uuid NOT NULL REFERENCES posts(id), user_id uuid NOT NULL REFERENCES users(id));
CREATE UNIQUE INDEX post_bookmarks_uq ON post_bookmarks(post_id, user_id);
--> statement-breakpoint
CREATE TABLE communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, description text NOT NULL DEFAULT '',
  is_private boolean NOT NULL DEFAULT false, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE community_members (
  community_id uuid NOT NULL REFERENCES communities(id), user_id uuid NOT NULL REFERENCES users(id),
  role member_role NOT NULL DEFAULT 'member', joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX community_members_uq ON community_members(community_id, user_id);
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES communities(id),
  code text NOT NULL UNIQUE, max_uses integer NOT NULL DEFAULT 1, uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_id uuid NOT NULL REFERENCES subs(id), user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, body text NOT NULL DEFAULT '', tag text NOT NULL DEFAULT 'Diskussion', is_top boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE thread_votes (
  thread_id uuid NOT NULL REFERENCES threads(id), user_id uuid NOT NULL REFERENCES users(id), delta integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX thread_votes_uq ON thread_votes(thread_id, user_id);
CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL REFERENCES threads(id), user_id uuid NOT NULL REFERENCES users(id),
  parent_id uuid REFERENCES comments(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, avatar_url text, is_group boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversation_members (conversation_id uuid NOT NULL REFERENCES conversations(id), user_id uuid NOT NULL REFERENCES users(id));
CREATE UNIQUE INDEX conversation_members_uq ON conversation_members(conversation_id, user_id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id), sender_id uuid NOT NULL REFERENCES users(id),
  text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), type notif_type NOT NULL DEFAULT 'system',
  title text NOT NULL, body text NOT NULL DEFAULT '', read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);