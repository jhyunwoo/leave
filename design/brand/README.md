# 리브 브랜드 아이콘

`leave-icon-imagegen-source.png`는 ImageGen으로 생성한 원본입니다.
열린 문을 지나 햇빛을 향해 이어지는 길로 “휴가를 나가는 순간”을
표현했습니다.

- Ink: `#0e0f0c`
- Leave green: `#9fe870`
- ImageGen 원본: `leave-icon-imagegen-source.png`
- 플랫폼 마스터: `leave-icon.png`
- 투명 심볼: `leave-mark.png`
- 원본 정규화: `node design/brand/normalize-imagegen-master.mjs`
- 앱·웹 에셋 재생성: `node design/brand/generate-assets.mjs`
- 스토어 에셋 갱신: `node store/generate/render.mjs --brand-only`

ImageGen 원본의 미세한 명암을 두 브랜드 색상으로 정규화한 뒤 모든 플랫폼
에셋을 PNG로 생성합니다.
