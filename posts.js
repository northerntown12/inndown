// =========================================================
// 블로그 글 목록 (왼쪽 "퇴근 후의 기록" 칸, blog.html, 글 페이지가 모두 이 파일을 읽어요)
//
// ▶ 새 글을 올리는 방법
//   1) posts 폴더의 _template.html 을 복사해서 이름을 바꿔요.  예) posts/2026-11-20-jeju.html
//      (이름은 영어·숫자·하이픈만. 날짜를 앞에 붙이면 정리하기 편해요)
//   2) 그 파일 안의 제목·날짜·본문을 고쳐요.
//   3) 아래 posts 목록 맨 위에 한 줄을 추가해요. (쉼표 , 잊지 않기)
//   4) 새 글 파일 + posts.js 를 깃허브에 올리면 끝!
//
//   항목 설명
//     id      : 파일 이름에서 .html 을 뺀 것
//     title   : 글 제목
//     date    : 날짜 "YYYY-MM-DD"
//     cat     : 카테고리 id (travel / music / stock / life)
//     sub     : 작은 분류 id (아래 cats 의 subs 참고)
//     summary : 목록에 보이는 한두 줄 소개
//     thumb   : (선택) 목록 사진. 예) "posts/img/jeju-1.webp"  — 없으면 빼도 돼요
// =========================================================
window.BLOG = {
    title: "퇴근 후의 기록",
    tagline: "여행 · 음악 · 주식 · 일상",

    cats: [
        { id: "travel", name: "여행", color: "#2a9d8f",
          subs: [ { id: "korea",  name: "국내 여행" },
                  { id: "abroad", name: "해외 여행" } ] },
        { id: "music",  name: "음악", color: "#a05195",
          subs: [ { id: "kpop", name: "가요" },
                  { id: "pop",  name: "팝" },
                  { id: "jazz", name: "재즈·클래식" } ] },
        { id: "stock",  name: "주식", color: "#e0a030",
          subs: [ { id: "kr",    name: "국내 주식" },
                  { id: "us",    name: "미국 주식" },
                  { id: "study", name: "공부 노트" } ] },
        { id: "life",   name: "일상", color: "#e76f51",
          subs: [ { id: "after",  name: "퇴근 후" },
                  { id: "notice", name: "블로그 소식" } ] }
    ],

    posts: [
        { id: "2026-11-09-start", title: "블로그를 시작하며", date: "2026-11-09",
          cat: "life", sub: "notice",
          summary: "퇴근 후의 시간을 기록해 보려고 합니다. 이 블로그에서 다룰 이야기들을 소개해요." }
    ]
};
