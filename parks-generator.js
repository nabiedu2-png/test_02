/**
 * 비밀 정원(공원) 데이터 생성 및 거리 계산 유틸리티
 */

// 하버사인 공식(Haversine Formula)을 이용한 두 좌표 사이의 거리 계산 (단위: 미터)
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 지구 반경 (m)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c); // 미터 단위 거리
}

// 비밀 정원 이름 및 기본 설명/태그 템플릿
const PARK_TEMPLATES = [
    {
        name: "소담스런 이끼 정원",
        description: "고풍스러운 오래된 단풍나무 아래, 고요하게 내려앉은 초록 이끼가 편안함을 선사하는 작은 정원입니다.",
        tags: ["조용한", "그늘이 많은", "벤치가 있는", "사람이 적은"]
    },
    {
        name: "바람의 언덕 잔디밭",
        description: "낮은 야산 모퉁이에 자리한 아담한 잔디밭입니다. 홀로 놓인 나무 벤치에 누워 바람을 느끼기 좋습니다.",
        tags: ["조용한", "벤치가 있는", "사람이 적은"]
    },
    {
        name: "숨겨진 동백 쉼터",
        description: "붉은 동백나무가 빽빽이 둘러싸고 있어, 외부의 시선과 소음으로부터 완벽히 차단된 아늑한 공간입니다.",
        tags: ["조용한", "그늘이 많은", "사람이 적은"]
    },
    {
        name: "별빛 근린공원 모퉁이",
        description: "주택가 뒤편에 숨겨져 동네 주민도 잘 모르는 비밀 공간입니다. 밤에는 가로등 빛이 아늑하게 비춥니다.",
        tags: ["조용한", "벤치가 있는", "반려동물 가능"]
    },
    {
        name: "작은 대나무 숲길",
        description: "도심 빌딩숲 사이에 숨어 있는 한 줌의 대나무 길입니다. 대나무 잎사귀가 부딪히는 소리가 마음을 정화해 줍니다.",
        tags: ["조용한", "그늘이 많은"]
    },
    {
        name: "들꽃 흐드러진 공터",
        description: "철마다 다른 야생화들이 피어나는 평화로운 공터입니다. 돗자리를 펴고 책을 읽기에 제격입니다.",
        tags: ["조용한", "사람이 적은", "반려동물 가능"]
    },
    {
        name: "시냇가 버드나무 그늘",
        description: "졸졸 흐르는 실개천 바로 옆에 큰 버드나무가 가지를 늘어뜨려 시원한 그늘을 만들고 있습니다.",
        tags: ["조용한", "그늘이 많은", "물소리가 들리는", "벤치가 있는"]
    },
    {
        name: "햇살 어린 돌담정원",
        description: "정겨운 전통 돌담길 끝에 조용히 자리 잡은 정원입니다. 볕이 따뜻하게 잘 들어 사색하기 좋습니다.",
        tags: ["조용한", "벤치가 있는", "사람이 적은"]
    },
    {
        name: "이끼 낀 벽돌 쉼터",
        description: "붉은 벽돌 담벼락에 담쟁이덩굴이 멋스럽게 얽힌 아늑한 그늘막 쉼터입니다. 여름에도 시원합니다.",
        tags: ["조용한", "그늘이 많은", "벤치가 있는"]
    },
    {
        name: "피아노 숲속 오두막 정원",
        description: "마치 숲속 깊은 오두막 마당에 와 있는 듯한 조용하고 울창한 정원입니다. 새소리가 선명하게 들립니다.",
        tags: ["조용한", "그늘이 많은", "사람이 적은", "반려동물 가능"]
    }
];

// 난수 생성 도구 (시드 기반 혹은 일반 난수)
function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

// 사용자 주변 가상 공원 생성기
export function generateNearbyParks(userLat, userLng) {
    const parks = [];
    const count = PARK_TEMPLATES.length;

    PARK_TEMPLATES.forEach((template, index) => {
        // 사용자 위치 반경 100m ~ 1500m 사이로 분산 생성
        // 위경도 1도는 대략 111km이므로 반경 1.5km는 대략 0.0135도 이내
        const angle = getRandomInRange(0, 2 * Math.PI);
        const distanceOffset = getRandomInRange(0.001, 0.013); // 약 100m~1.4km
        
        const lat = userLat + distanceOffset * Math.sin(angle);
        const lng = userLng + distanceOffset * Math.cos(angle);

        // 고요함 점수 (85 ~ 98점) 생성
        const quietnessScore = Math.floor(getRandomInRange(85, 99));

        // 혼잡도 결정
        let congestion = "매우 한적함";
        if (quietnessScore < 90) {
            congestion = "한적함";
        }

        // 거리 계산
        const distance = calculateDistance(userLat, userLng, lat, lng);

        // 도보 예상 이동 시간 계산 (평균 도보 속도 4km/h = 분당 66m)
        const walkTime = Math.ceil(distance / 66);

        parks.push({
            id: `park-${index + 1}`,
            name: template.name,
            lat: lat,
            lng: lng,
            quietnessScore: quietnessScore,
            congestion: congestion,
            tags: [...template.tags],
            description: template.description,
            distance: distance,
            walkTime: walkTime
        });
    });

    return parks;
}
