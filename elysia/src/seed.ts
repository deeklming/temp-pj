import { eq } from "drizzle-orm";
import type { Language } from "../../shared/contracts";
import type { BoardDatabase } from "./db";
import { posts, users } from "./schema";

const examples: { title: string; content: string; language: Language }[] = [
	{
		title: "작은 시작",
		content: "오늘의 생각을 한 문장씩 기록합니다.\n작은 시작이 새로운 이야기가 됩니다.",
		language: "ko-KR",
	},
	{
		title: "산책의 기록",
		content: "익숙한 길에서 새로운 풍경을 만났습니다.\n당신의 하루는 어땠나요?",
		language: "ko-KR",
	},
	{
		title: "A small beginning",
		content: "A place to collect everyday thoughts.\nEvery story begins with a single sentence.",
		language: "en-US",
	},
	{
		title: "An afternoon walk",
		content: "The familiar street looked different today.\nWhat did you notice on your way home?",
		language: "en-US",
	},
	{
		title: "小さな始まり",
		content: "日々の思いを少しずつ書き留めます。\n一つの言葉から、新しい物語が始まります。",
		language: "ja-JP",
	},
	{
		title: "散歩の記録",
		content: "いつもの道で、新しい景色に出会いました。\nあなたは今日、何を見つけましたか。",
		language: "ja-JP",
	},
];
export async function seedDatabase({ db }: BoardDatabase) {
	const passwordHash = await Bun.password.hash("DemoPass123!", { algorithm: "argon2id" });
	db.transaction((tx) => {
		const ids: string[] = [];
		for (const [index, nickname] of ["Alex", "Hana"].entries()) {
			const email = `demo${index + 1}@example.com`;
			tx.insert(users)
				.values({
					id: `demo-user-${index + 1}`,
					email,
					nickname,
					passwordHash,
					createdAt: new Date().toISOString(),
				})
				.onConflictDoNothing()
				.run();
			const user = tx.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
			if (!user) throw new Error("Demo account could not be created");
			ids.push(user.id);
		}
		const samples = [
			...examples,
			...Array.from({ length: 200 }, (_, index) => {
				const example = examples[index % examples.length];
				if (!example) throw new Error("Demo example missing");
				return { ...example, title: `${example.title} · ${String(index + 1).padStart(3, "0")}` };
			}),
		];
		for (const [index, example] of samples.entries()) {
			const createdAt = new Date(Date.now() - index * 3600000).toISOString();
			tx.insert(posts)
				.values({
					...example,
					id: `demo-post-${index + 1}`,
					authorId: ids[index % 2] ?? "demo-user-1",
					createdAt,
					updatedAt: createdAt,
				})
				.onConflictDoNothing()
				.run();
		}
	});
}
