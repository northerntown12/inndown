# 오목 온라인 대결 서버 만들기 (Cloudflare, 무료)

온라인 대결은 Cloudflare **Worker**(서버 코드)와 **D1**(작은 데이터베이스)로 움직여요.
아래 순서대로 한 번만 만들면 돼요. (깃허브에는 이 파일과 `omok-online-worker.js`를 올릴 필요 없어요)

## 1. D1 데이터베이스 만들기
1. Cloudflare 대시보드 → 왼쪽 메뉴 **Storage & Databases(저장소 및 데이터베이스)** → **D1 SQL Database**
2. **Create(만들기)** → 이름 `omok-db` → 만들기
   (표는 서버가 처음 쓸 때 저절로 만들어요. SQL을 칠 필요 없어요)

## 2. Worker 만들기
1. 왼쪽 메뉴 **Workers & Pages** → **Create(만들기)** → **Start with Hello World!** (Hello World로 시작)
2. 이름을 **`omok-online`** 으로 바꾸고 **Deploy(배포)**
3. **Edit code(코드 편집)** → 안에 있는 코드를 모두 지우고 → PC 폴더의 `omok-online-worker.js` 내용을 통째로 붙여넣기 → **Deploy(배포)**

## 3. Worker와 D1 연결 (바인딩)
1. `omok-online` Worker → **Settings(설정)** → **Bindings(바인딩)** → **Add(추가)** → **D1 database**
2. Variable name(변수 이름): **`DB`** (대문자) / D1 database: **`omok-db`** → 저장(Deploy)

## 4. 주소 확인
- Worker 주소가 **`https://omok-online.sumerboy.workers.dev`** 이면 그대로 끝이에요.
- 이름을 다르게 지었다면 `omok.js` 맨 위의 `ONLINE_URL` 한 줄만 그 주소로 바꾸기.
- 나중에 개인 도메인을 쓰면 `omok-online-worker.js` 맨 위 `ALLOW_ORIGINS`에 그 주소(예: `https://내도메인.com`)를 한 줄 추가하고 다시 붙여넣기.

## 5. 시험
- PC와 폰(또는 일반 창과 시크릿 창)에서 오목을 열고 → **🌐 온라인 대결**
- 한쪽에서 **방 만들기** → 나온 4자리 코드를 다른 쪽에 넣고 **입장** (또는 **링크 복사**로 보낸 링크 열기)
- 아무나와: 양쪽에서 **⚡ 빠른 매칭**
- "온라인 서버에 연결하지 못했어요"가 나오면: 2·3번(특히 변수 이름 `DB`)과 4번 주소를 확인

## 무료 한도 (2026-11 기준)
- Workers: 하루 요청 10만 번 / D1: 하루 읽기 500만 줄, 쓰기 10만 줄
- 상대 수를 기다릴 때 서버가 최대 20초씩 연결을 붙잡아 두는 방식이라, 한 판(약 5~10분)에 요청이 수십~백 번 정도 → 개인 홈피로는 넉넉해요
