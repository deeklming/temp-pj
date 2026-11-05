from datetime import UTC, datetime, timedelta

from sqlalchemy.dialects.sqlite import insert
from sqlmodel import select

from .auth import passwords
from .models import Post, User

EXAMPLES = [
    (
        "작은 시작",
        "오늘의 생각을 한 문장씩 기록합니다.\n작은 시작이 새로운 이야기가 됩니다.",
        "ko-KR",
    ),
    ("산책의 기록", "익숙한 길에서 새로운 풍경을 만났습니다.\n당신의 하루는 어땠나요?", "ko-KR"),
    (
        "A small beginning",
        "A place to collect everyday thoughts.\nEvery story begins with a single sentence.",
        "en-US",
    ),
    (
        "An afternoon walk",
        "The familiar street looked different today.\nWhat did you notice on your way home?",
        "en-US",
    ),
    (
        "小さな始まり",
        "日々の思いを少しずつ書き留めます。\n一つの言葉から、新しい物語が始まります。",
        "ja-JP",
    ),
    (
        "散歩の記録",
        "いつもの道で、新しい景色に出会いました。\nあなたは今日、何を見つけましたか。",
        "ja-JP",
    ),
]


def seed_database(database):
    timestamp = datetime.now(UTC)
    password_hash = passwords.hash("DemoPass123!")
    with database.session() as session:
        ids = []
        for i, nickname in enumerate(("Alex", "Hana"), 1):
            email = f"demo{i}@example.com"
            session.exec(
                insert(User)
                .values(
                    id=f"demo-user-{i}",
                    email=email,
                    nickname=nickname,
                    password_hash=password_hash,
                    created_at=timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                )
                .on_conflict_do_nothing()
            )
            ids.append(session.exec(select(User).where(User.email == email)).one().id)
        for index in range(206):
            title, content, language = (
                EXAMPLES[index % 6] if index < 6 else EXAMPLES[(index - 6) % 6]
            )
            if index >= 6:
                title += f" · {index - 5:03d}"
            created = (
                (timestamp - timedelta(hours=index))
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )
            session.exec(
                insert(Post)
                .values(
                    id=f"demo-post-{index + 1}",
                    author_id=ids[index % 2],
                    title=title,
                    content=content,
                    language=language,
                    created_at=created,
                    updated_at=created,
                )
                .on_conflict_do_nothing()
            )
        session.commit()
