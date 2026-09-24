import { db } from "./src/db/client";
import {
  comments,
  communities,
  communityMembers,
  conversations,
  conversationMembers,
  growEnv,
  growLogs,
  grows,
  hallEntries,
  messages,
  notifications,
  offers,
  posts,
  products,
  strains,
  subs,
  users,
  wikiArticles,
  breeders as breedersTable,
} from "./src/db/schema";
import { hashPassword } from "./src/lib/password";
import { env } from "./src/env";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

async function ensureBucket() {
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
  });
  try {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    console.log(`✅ Bucket „${env.S3_BUCKET}“ bereit.`);
  } catch {
    console.log(`ℹ️  Bucket „${env.S3_BUCKET}“ existiert bereits.`);
  }
}

async function main() {
  await ensureBucket();
  // Idempotenz: wenn schon Daten vorhanden, abbrechen.
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length) {
    console.log("⏭  Seed übersprungen (Daten vorhanden).");
    process.exit(0);
  }

  const [admin] = await db
    .insert(users)
    .values({
      email: env.SEED_ADMIN_EMAIL,
      name: "Admin",
      handle: "admin",
      passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
      role: "platform_admin",
      level: 20,
      title: "Grow Master",
    })
    .returning();
  console.log("✅ Admin angelegt:", admin.email);

  // Katalog: Subs
  const subsData = ["r/GrowTagebuch", "r/LivingSoil", "r/Automatik", "r/Schädlinge", "r/DIY", "r/Erntezeit"];
  await db.insert(subs).values(subsData.map((name) => ({ name })));

  // Breeder
  const breedersData = [
    { name: "Royal Seed Co.", location: "Amsterdam, NL", founded: 2003, rating: 4.8, strainsCount: 42, verified: true, logoColor: "leaf", bio: "Robuste, ertragreiche Genetiken mit konstanter Keimrate." },
    { name: "Hazy Genetics", location: "Barcelona, ES", founded: 2015, rating: 4.7, strainsCount: 28, verified: true, logoColor: "info", bio: "Sativa-dominante Haze-Kreuzungen und Terpen-Bomben." },
    { name: "Soil & Soul Seeds", location: "Berlin, DE", founded: 2019, rating: 4.6, strainsCount: 19, verified: true, logoColor: "soil", bio: "Bio-Zucht für Living-Soil-Grower, CBD-reiche Sorten." },
    { name: "Dutch Passionista", location: "Eindhoven, NL", founded: 1998, rating: 4.9, strainsCount: 55, verified: true, logoColor: "leaf", bio: "Pioniere der feminisierten und automatischen Samen." },
    { name: "Northern Lights Breeding", location: "Oslo, NO", founded: 2007, rating: 4.7, strainsCount: 24, verified: true, logoColor: "info", bio: "Kalt-tolerante Indica-Linien." },
  ];
  const breeders = await db.insert(breedersTable).values(breedersData).returning();
  const breederId = (name: string) => breeders.find((b) => b.name === name)?.id ?? null;

  // Sorten
  await db.insert(strains).values([
    { name: "Northern Haze", breederName: "Hazy Genetics", breederId: breederId("Hazy Genetics"), type: "Sativa", thc: 24, cbd: 0.4, flowering: 10, yieldRange: "500–600 g/m²", difficulty: 3, rating: 4.7, reviews: 312, price: 68, tag: "Energetisch", color: "info", notes: "Kiefrige Zitrusnoten.", effects: ["Euphorisch", "Kreativ", "Fokus"] },
    { name: "OG Kushberry", breederName: "Royal Seed Co.", breederId: breederId("Royal Seed Co."), type: "Hybrid", thc: 22, cbd: 0.6, flowering: 8, yieldRange: "450–550 g/m²", difficulty: 2, rating: 4.8, reviews: 540, price: 59, tag: "Ausgewogen", color: "leaf", notes: "Beeren-Sweetness.", effects: ["Entspannt", "Glücklich"] },
    { name: "Gorilla Glue #4", breederName: "Dutch Passionista", breederId: breederId("Dutch Passionista"), type: "Hybrid", thc: 27, cbd: 0.2, flowering: 9, yieldRange: "550–650 g/m²", difficulty: 2, rating: 4.9, reviews: 889, price: 74, tag: "Klebrig", color: "soil", notes: "Extrem harzreich.", effects: ["Stark", "Beruhigend"] },
    { name: "Critical Mass", breederName: "Northern Lights Breeding", breederId: breederId("Northern Lights Breeding"), type: "Indica", thc: 20, cbd: 0.8, flowering: 7, yieldRange: "600–700 g/m²", difficulty: 1, rating: 4.6, reviews: 421, price: 49, tag: "Ertragreich", color: "leaf", notes: "Riesige Blüten.", effects: ["Schmerzstillend", "Schlaf"] },
    { name: "Purple Punch", breederName: "Soil & Soul Seeds", breederId: breederId("Soil & Soul Seeds"), type: "Indica", thc: 19, cbd: 1.2, flowering: 8, yieldRange: "400–500 g/m²", difficulty: 1, rating: 4.5, reviews: 198, price: 55, tag: "Desert", color: "soil", notes: "Traube-Backpulver.", effects: ["Sedierend", "Süß"] },
  ]);

  // Produkte
  await db.insert(products).values([
    { name: "LED Grow Panel 480W", category: "Beleuchtung", brand: "PhytoMax", price: 349, rating: 4.8, reviews: 142, condition: "Neu", image: "leaf" },
    { name: "Growzelt 120×120×200", category: "Zelt", brand: "SecretTent", price: 129, rating: 4.6, reviews: 320, condition: "Wie neu", image: "soil" },
    { name: "Living Soil Mix 50L", category: "Erde & Medium", brand: "Soil & Soul", price: 34, rating: 4.9, reviews: 211, condition: "Neu", image: "soil" },
    { name: "pH/EC Kombi-Messgerät", category: "Messtechnik", brand: "AquaTest", price: 119, rating: 4.6, reviews: 64, condition: "Gebraucht", image: "info" },
  ]);

  // Angebote
  await db.insert(offers).values([
    { strain: "Northern Haze", breeder: "Hazy Genetics", shop: "SeedHub", price: 54, oldPrice: 68, type: "Sativa", fem: true },
    { strain: "Gorilla Glue #4", breeder: "Dutch Passionista", shop: "GreenMail", price: 62, oldPrice: 74, type: "Hybrid", fem: true },
    { strain: "Critical Mass", breeder: "Northern Lights Breeding", shop: "SeedHub", price: 39, oldPrice: 49, type: "Indica", fem: true },
  ]);

  // Hall of Fame
  await db.insert(hallEntries).values([
    { title: "Living Soil Monster", grower: "soilWizard", strain: "Gorilla Glue #4", imageUrl: "https://images.pexels.com/photos/12642803/pexels-photo-12642803.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", award: "Ernte des Monats", likes: 1843, comments: 142, aspect: "aspect-[4/5]" },
    { title: "Purple Canopy", grower: "harvestHans", strain: "Purple Punch", imageUrl: "https://images.pexels.com/photos/16352841/pexels-photo-16352841.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", award: "Best Color", likes: 1290, comments: 98, aspect: "aspect-square" },
    { title: "Haze Tower 2m", grower: "NebulaGrow", strain: "Northern Haze", imageUrl: "https://images.pexels.com/photos/35996089/pexels-photo-35996089.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200", award: "Tallest Grow", likes: 2204, comments: 211, aspect: "aspect-[3/5]" },
  ]);

  // Wiki
  await db.insert(wikiArticles).values([
    { title: "Living Soil: Das Mikrobiom verstehen", category: "Anbaumedium", excerpt: "Wie ein lebendiges Bodensystem deine Pflanzen versorgt.", body: ["Living Soil ist kein Substrat, sondern ein Ökosystem.", "Ein gut etablierter Boden speichert Wasser wie ein Schwamm."], author: "Lena B.", version: "v4.2", readMin: 8, tags: ["Soil", "Mikrobiom"] },
    { title: "VPD: Dampdruckdefizit richtig lesen", category: "Licht", excerpt: "Temperatur und Luftfeuchtigkeit im Zusammenspiel.", body: ["Das VPD beschreibt, wie stark die Luft Feuchtigkeit aus den Blättern zieht."], author: "Tom K.", version: "v2.0", readMin: 6, tags: ["Klima", "VPD"] },
  ]);

  // Demo-Content für Admin
  const [grow] = await db
    .insert(grows)
    .values({
      userId: admin.id, name: "HazyDream · Run 03", breeder: "Hazy Genetics", type: "Sativa",
      medium: "Living Soil (No-Till)", startDate: new Date().toISOString().slice(0, 10),
      day: 64, totalDays: 98, phase: "Blüte", phaseIndex: 2, progress: 65, health: 94,
      expectedYield: "320–380 g",
    })
    .returning();
  await db.insert(growLogs).values([
    { growId: grow.id, day: 64, date: "heute", title: "Trichome milchig", body: "Erste Trichome werden trüb.", tag: "Beobachtung" },
    { growId: grow.id, day: 60, date: "vor 4 Tagen", title: "Komposttee gegossen", body: "2 ml/L Komplex.", tag: "Dünger" },
  ]);
  await db.insert(growEnv).values([
    { growId: grow.id, day: 50, temp: 24.2, rh: 54, vpd: 1.2, ec: 1.4 },
    { growId: grow.id, day: 58, temp: 24.8, rh: 52, vpd: 1.24, ec: 1.44 },
    { growId: grow.id, day: 64, temp: 24.6, rh: 54, vpd: 1.21, ec: 1.42 },
  ]);

  await db.insert(notifications).values([
    { userId: admin.id, type: "ai", title: "KI-Ratgeber", body: "Deine VPD liegt leicht über dem Optimum.", read: false },
    { userId: admin.id, type: "task", title: "Nächster Task", body: "Komposttee vorbereiten.", read: false },
    { userId: admin.id, type: "shop", title: "Angebot", body: "Northern Haze jetzt 54 €.", read: true },
  ]);

  await db.insert(posts).values([
    { userId: admin.id, text: "Woche 7 Blüte – Trichome werden bernsteinfarben 🌿", tags: ["Blüte"] },
  ]);

  const [publicCommunity] = await db.insert(communities).values({
    name: "Grow|Observer Public",
    description: "Öffentliche Community für Grow-Tagebücher, Wissen und Austausch.",
    isPrivate: false,
    createdBy: admin.id,
  }).returning();
  const [privateCommunity] = await db.insert(communities).values({
    name: "Admin Test Circle",
    description: "Private Test-Community für Invite- und Rollen-Flows.",
    isPrivate: true,
    createdBy: admin.id,
  }).returning();
  await db.insert(communityMembers).values([
    { communityId: publicCommunity.id, userId: admin.id, role: "admin" },
    { communityId: privateCommunity.id, userId: admin.id, role: "admin" },
  ]);

  const [conv] = await db
    .insert(conversations)
    .values({ name: "Grow-Crew", isGroup: true })
    .returning();
  await db.insert(conversationMembers).values({ conversationId: conv.id, userId: admin.id });
  await db.insert(messages).values([
    { conversationId: conv.id, senderId: admin.id, text: "Hallo zusammen 👋" },
  ]);

  console.log("✅ Katalog + Demo-Content eingespielt.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Seed fehlgeschlagen:", e);
  process.exit(1);
});
