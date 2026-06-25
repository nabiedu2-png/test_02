import { calculateDistance } from './parks-generator.js';

// 애플리케이션 상태 관리
const state = {
    userCoords: { lat: 37.5443, lng: 127.0374 }, // 기본 좌표 (서울숲)
    isSimulation: true,
    allParks: [],
    filteredParks: [],
    searchRadius: 1000, // 기본 1km (단위: 미터)
    activeTags: new Set(['조용한']), // 기본적으로 '조용한' 태그 활성화
    sortBy: 'quietness', // 'quietness' (고요함 순) 또는 'distance' (거리 순)
    
    // 지도 인스턴스
    map: null,
    navMap: null,
    
    // 지도 요소
    userMarker: null,
    parkMarkers: [],
    navUserMarker: null,
    navParkMarker: null,
    routingLine: null,
    
    activePark: null,
    tempMarker: null
};

// DOM 요소 캐싱
const DOM = {
    radiusSlider: document.getElementById('radiusSlider'),
    radiusValue: document.getElementById('radiusValue'),
    tagFiltersContainer: document.getElementById('tagFilters'),
    parksList: document.getElementById('parksList'),
    listCount: document.getElementById('listCount'),
    sortBtn: document.getElementById('sortBtn'),
    sortLabel: document.getElementById('sortLabel'),
    mapStatus: document.getElementById('mapStatus'),
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    locationSimText: document.getElementById('locationSimText'),
    
    // 길안내 오버레이 요소
    navOverlay: document.getElementById('navOverlay'),
    navBackBtn: document.getElementById('navBackBtn'),
    navDestName: document.getElementById('navDestName'),
    navDestDesc: document.getElementById('navDestDesc'),
    navSummaryTime: document.getElementById('navSummaryTime'),
    navSummaryDistance: document.getElementById('navSummaryDistance'),
    navTimeline: document.getElementById('navTimeline'),
    
    // 토스트 알림
    toastMsg: document.getElementById('toastMsg'),
    toastText: document.getElementById('toastText'),

    // 정원 추가 바텀 시트 관련
    bottomSheetOverlay: document.getElementById('bottomSheetOverlay'),
    bottomSheet: document.getElementById('bottomSheet'),
    closeSheetBtn: document.getElementById('closeSheetBtn'),
    addGardenForm: document.getElementById('addGardenForm'),
    gardenName: document.getElementById('gardenName'),
    gardenCoords: document.getElementById('gardenCoords'),
    ratingStars: document.getElementById('ratingStars'),
    gardenRating: document.getElementById('gardenRating'),
    formTagChips: document.getElementById('formTagChips'),
    gardenComment: document.getElementById('gardenComment'),
    recenterBtn: document.getElementById('recenterBtn')
};

// 앱 초기화 실행
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// 메인 초기화 함수
function initApp() {
    setupEventListeners();
    setupAddGardenForm();
    requestUserLocation();
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 1. 반경 슬라이더
    DOM.radiusSlider.addEventListener('input', (e) => {
        state.searchRadius = parseInt(e.target.value);
        const kmVal = (state.searchRadius / 1000).toFixed(1);
        DOM.radiusValue.textContent = `${kmVal}km`;
        filterAndRenderParks();
        
        // 탐색 반경 변경 시 지도 범위 조절 (반경에 맞게 줌 레벨 조정)
        if (state.map) {
            const zoomLevel = state.searchRadius >= 2000 ? 14 : (state.searchRadius >= 1500 ? 14.5 : 15);
            state.map.setView([state.userCoords.lat, state.userCoords.lng], zoomLevel);
        }
    });

    // 2. 태그 필터링
    const tagButtons = DOM.tagFiltersContainer.querySelectorAll('.tag-btn');
    tagButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.dataset.tag;
            if (state.activeTags.has(tag)) {
                // '조용한' 태그가 기본이고 무조건 하나 이상의 필터를 유지하기 위한 안전장치
                if (state.activeTags.size > 1) {
                    state.activeTags.delete(tag);
                    btn.classList.remove('active');
                } else {
                    showToast('최소 한 개의 선호 태그를 지정해야 합니다.');
                }
            } else {
                state.activeTags.add(tag);
                btn.classList.add('active');
            }
            filterAndRenderParks();
        });
    });

    // 3. 정렬 방식 전환
    DOM.sortBtn.addEventListener('click', () => {
        if (state.sortBy === 'quietness') {
            state.sortBy = 'distance';
            DOM.sortLabel.textContent = '거리 가까운 순';
            showToast('거리 순으로 정렬되었습니다.');
        } else {
            state.sortBy = 'quietness';
            DOM.sortLabel.textContent = '고요함 점수 순';
            showToast('고요함 점수 순으로 정렬되었습니다.');
        }
        filterAndRenderParks();
    });

    // 4. 길안내 뒤로가기 버튼
    DOM.navBackBtn.addEventListener('click', () => {
        DOM.navOverlay.classList.remove('active');
        state.activePark = null;
    });

    // 5. 바텀 시트 닫기 이벤트
    DOM.closeSheetBtn.addEventListener('click', () => {
        closeAddGardenSheet();
    });

    DOM.bottomSheetOverlay.addEventListener('click', () => {
        closeAddGardenSheet();
    });

    // 6. 현위치 돌아가기 버튼 클릭 이벤트
    DOM.recenterBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 지도의 클릭 이벤트(바텀 시트 팝업) 방지
        if (state.map) {
            state.map.setView([state.userCoords.lat, state.userCoords.lng], 15);
            showToast('현재 위치로 지도를 이동했습니다.');
        }
    });
}

// 사용자 GPS 위치 요청
function requestUserLocation() {
    if ("geolocation" in navigator) {
        // GPS 신호 탐색 상태 표시
        updateLocationStatus('searching', '위치 신호 수신 중...');
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                state.userCoords.lat = position.coords.latitude;
                state.userCoords.lng = position.coords.longitude;
                state.isSimulation = false;
                
                updateLocationStatus('success', '현 위치 탐색 성공');
                setupMap();
                loadParksData();
            },
            (error) => {
                console.warn("Geolocation error:", error);
                // 에러 코드별 메시지 대응
                let errorMsg = '위치 권한을 획득할 수 없어 기본 위치(서울숲)를 기준으로 탐색합니다.';
                if (error.code === error.PERMISSION_DENIED) {
                    errorMsg = '위치 서비스 권한이 거부되어 가상 위치(서울숲)를 기준으로 탐색합니다.';
                }
                
                showToast(errorMsg, 4000);
                updateLocationStatus('simulated', '가상 위치 활성화');
                setupMap();
                loadParksData();
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
    } else {
        showToast('이 브라우저는 위치 서비스를 지원하지 않아 가상 위치를 사용합니다.', 4000);
        updateLocationStatus('simulated', '가상 위치 활성화');
        setupMap();
        loadParksData();
    }
}

// 상단 상태 인디케이터 업데이트
function updateLocationStatus(status, text) {
    DOM.statusText.textContent = text;
    DOM.statusIndicator.className = 'status-indicator';
    
    if (status === 'searching') {
        DOM.locationSimText.style.display = 'none';
    } else if (status === 'success') {
        DOM.statusIndicator.classList.add('success');
        DOM.locationSimText.style.display = 'none';
    } else if (status === 'simulated') {
        DOM.locationSimText.style.display = 'inline';
    }
}

// Leaflet 지도 초기화
function setupMap() {
    if (state.map) {
        state.map.remove();
    }

    // Leaflet 맵 객체 생성
    state.map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: false // 모바일 화면 스크롤 시 지도가 스크롤을 막는 현상 방지
    }).setView([state.userCoords.lat, state.userCoords.lng], 15);

    // 프리미엄 아날로그 스타일 맵 타일 레이어 로드 (CartoDB Positron - Light)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.map);

    // 사용자 위치 커스텀 아이콘 설정
    const userIcon = L.divIcon({
        className: 'user-marker-icon',
        html: '<div class="user-marker-pulse"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    state.userMarker = L.marker([state.userCoords.lat, state.userCoords.lng], { icon: userIcon })
        .addTo(state.map)
        .bindPopup(`
            <div class="popup-title">나의 현 위치</div>
            <div class="popup-distance">여기서부터 비밀 정원을 탐색합니다.</div>
        `);

    // 지도 클릭 시 바텀 시트 열기 및 임시 마커 표시
    state.map.on('click', (e) => {
        if (state.activePark) {
            DOM.navOverlay.classList.remove('active');
            state.activePark = null;
        }
        
        const { lat, lng } = e.latlng;
        openAddGardenSheet(lat, lng);
    });
}

// 공원 데이터 적재
function loadParksData() {
    // 로컬 JSON 파일을 fetch로 비동기 로드
    fetch('./gardens-data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('네트워크 응답 에러');
            }
            return response.json();
        })
        .then(data => {
            // 가져온 정원 목록을 사용자 현재 위치 기준으로 거리와 도보 시간을 매핑
            state.allParks = data.map(park => {
                const distance = calculateDistance(state.userCoords.lat, state.userCoords.lng, park.lat, park.lng);
                const walkTime = Math.ceil(distance / 66);
                return {
                    ...park,
                    distance: distance,
                    walkTime: walkTime
                };
            });
            filterAndRenderParks();
        })
        .catch(error => {
            console.error('정원 데이터를 불러오는 중 오류 발생:', error);
            showToast('로컬 정원 데이터를 불러오지 못했습니다.');
        });
}

// 필터링 및 정렬 처리 후 렌더링
function filterAndRenderParks() {
    // 1. 반경 필터링 (meter 단위 비교)
    let results = state.allParks.filter(park => park.distance <= state.searchRadius);
    
    // 2. 선호 태그 필터링 (선택된 모든 태그를 만족하는 공원만 필터링)
    if (state.activeTags.size > 0) {
        results = results.filter(park => {
            return Array.from(state.activeTags).every(tag => park.tags.includes(tag));
        });
    }

    // 3. 정렬 처리
    if (state.sortBy === 'quietness') {
        // 고요함 점수가 높은 순으로 정렬 (점수가 같으면 가까운 순)
        results.sort((a, b) => {
            if (b.quietnessScore === a.quietnessScore) {
                return a.distance - b.distance;
            }
            return b.quietnessScore - a.quietnessScore;
        });
    } else {
        // 거리가 가까운 순으로 정렬
        results.sort((a, b) => a.distance - b.distance);
    }

    state.filteredParks = results;
    
    // 카운터 및 목록 렌더링
    DOM.listCount.innerHTML = `<i class="fa-solid fa-tree"></i> 이내 비밀 정원 <strong>${state.filteredParks.length}곳</strong>`;
    renderParksList();
    renderParksMarkers();
}

// 리스트 카드 렌더링
function renderParksList() {
    DOM.parksList.innerHTML = '';

    if (state.filteredParks.length === 0) {
        DOM.parksList.innerHTML = `
            <div class="empty-results">
                <i class="fa-solid fa-tree-deciduous"></i>
                <p>지정한 필터 조건 내에 비밀 정원이 없습니다.<br>반경을 넓히거나 다른 태그를 골라보세요.</p>
            </div>
        `;
        return;
    }

    state.filteredParks.forEach(park => {
        const card = document.createElement('div');
        card.className = 'park-card';
        card.innerHTML = `
            <div class="park-card-header">
                <div>
                    <h3 class="park-title">${park.name}</h3>
                </div>
                <div class="quietness-badge">
                    <span class="score-num">${park.quietnessScore}<span style="font-size:11px; font-weight:normal;">점</span></span>
                    <span class="score-label">고요함 점수</span>
                </div>
            </div>
            
            <p class="park-description">${park.description}</p>
            
            <div class="card-tags">
                ${park.tags.map(tag => `<span class="card-tag">#${tag}</span>`).join('')}
            </div>

            <div class="park-meta">
                <div class="meta-left">
                    <span class="meta-distance">
                        <i class="fa-solid fa-location-arrow" style="font-size:10px;"></i> ${formatDistance(park.distance)}
                    </span>
                    <span class="meta-time">
                        <i class="fa-solid fa-person-walking" style="font-size:10px;"></i> 도보 ${park.walkTime}분
                    </span>
                </div>
                <div class="meta-right-stamp">
                    ${park.congestion}
                </div>
            </div>
        `;

        // 카드 클릭 시 카카오맵 길찾기 시작
        card.addEventListener('click', () => {
            openKakaoMapNavigation(park);
        });

        DOM.parksList.appendChild(card);
    });
}

// 지도 마커 렌더링
function renderParksMarkers() {
    // 기존 마커 제거
    state.parkMarkers.forEach(marker => state.map.removeLayer(marker));
    state.parkMarkers = [];

    state.filteredParks.forEach((park, idx) => {
        const customIcon = L.divIcon({
            className: 'park-marker-icon',
            html: `<i class="fa-solid fa-leaf" style="font-size:14px;"></i>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        const marker = L.marker([park.lat, park.lng], { icon: customIcon })
            .addTo(state.map)
            .bindPopup(`
                <div class="popup-title">${park.name}</div>
                <div class="popup-distance">고요함: ${park.quietnessScore}점 | 도보 약 ${park.walkTime}분</div>
                <button class="tag-btn" style="margin-top:6px; padding:3px 8px; width:100%; justify-content:center; background-color:var(--color-primary); color:white; border:none; cursor:pointer;" id="popup-btn-${park.id}">
                    <i class="fa-solid fa-route"></i> 길안내 시작
                </button>
            `);

        marker.on('popupopen', () => {
            document.getElementById(`popup-btn-${park.id}`).addEventListener('click', () => {
                openKakaoMapNavigation(park);
                marker.closePopup();
            });
        });

        state.parkMarkers.push(marker);
    });
}

// 카카오맵 공식 길찾기 새 창 연결
function openKakaoMapNavigation(park) {
    const kakaoMapUrl = `https://map.kakao.com/link/to/${encodeURIComponent(park.name)},${park.lat},${park.lng}`;
    window.open(kakaoMapUrl, '_blank');
}

// 거리 포맷팅 함수 (m -> km 변환 등)
function formatDistance(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${meters}m`;
}

// 토스트 팝업 띄우기 함수
let toastTimeout = null;
function showToast(text, duration = 3000) {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    
    DOM.toastText.textContent = text;
    DOM.toastMsg.classList.add('show');
    
    toastTimeout = setTimeout(() => {
        DOM.toastMsg.classList.remove('show');
    }, duration);
}

// 새로운 정원 제보 바텀 시트 열기
function openAddGardenSheet(lat, lng) {
    // 1. 임시 마커 표시 (지도 클릭한 곳에 핀 꽂기)
    if (state.tempMarker) {
        state.map.removeLayer(state.tempMarker);
    }
    
    const tempIcon = L.divIcon({
        className: 'temp-marker-icon',
        html: '<i class="fa-solid fa-location-dot" style="font-size:16px;"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    
    state.tempMarker = L.marker([lat, lng], { icon: tempIcon }).addTo(state.map);
    
    // 2. 폼 필드 초기화 및 좌표 입력 (소수점 5자리 포맷팅)
    DOM.gardenCoords.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    DOM.gardenName.value = '';
    
    // 태그 칩 선택 초기화 (모두 해제)
    const chips = DOM.formTagChips.querySelectorAll('.form-tag-chip');
    chips.forEach(chip => chip.classList.remove('active'));
    
    // 추천 코멘트 초기화
    DOM.gardenComment.value = '';
    
    // 별점 5점으로 초기화
    updateRatingStars(5);
    
    // 3. 바텀 시트와 오버레이 표시
    DOM.bottomSheet.classList.add('active');
    DOM.bottomSheetOverlay.classList.add('active');
    
    // 지도 중심을 약간 조정하여 마커와 바텀 시트가 겹치지 않게 처리
    state.map.panTo([lat, lng]);
}

// 새로운 정원 제보 바텀 시트 닫기
function closeAddGardenSheet() {
    // 1. 바텀 시트 및 오버레이 숨기기
    DOM.bottomSheet.classList.remove('active');
    DOM.bottomSheetOverlay.classList.remove('active');
    
    // 2. 임시 마커 제거
    if (state.tempMarker) {
        state.map.removeLayer(state.tempMarker);
        state.tempMarker = null;
    }
}

// 폼 초기 세팅 및 별점 인터랙션 바인딩
function setupAddGardenForm() {
    // 별점 버튼들에 대한 클릭 이벤트
    const starButtons = DOM.ratingStars.querySelectorAll('.star-btn');
    starButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const ratingValue = parseInt(btn.dataset.value);
            updateRatingStars(ratingValue);
        });
    });
    
    // 태그 칩 다중 선택 토글 이벤트 바인딩
    const tagChips = DOM.formTagChips.querySelectorAll('.form-tag-chip');
    tagChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            chip.classList.toggle('active');
        });
    });
    
    // 폼 제출 이벤트
    DOM.addGardenForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = DOM.gardenName.value.trim();
        const coordsStr = DOM.gardenCoords.value;
        const rating = parseInt(DOM.gardenRating.value);
        const comment = DOM.gardenComment.value.trim();
        
        if (!name) {
            showToast('정원 이름을 입력해 주세요.');
            return;
        }
        if (!coordsStr) {
            showToast('위도/경도 좌표가 올바르지 않습니다.');
            return;
        }
        
        const [latStr, lngStr] = coordsStr.split(',');
        const lat = parseFloat(latStr.trim());
        const lng = parseFloat(lngStr.trim());
        
        // 거리 계산 (사용자 기준)
        const distance = calculateDistance(state.userCoords.lat, state.userCoords.lng, lat, lng);
        const walkTime = Math.ceil(distance / 66); // 도보 속도 4km/h 기준
        
        // 고요함 점수 (별점에 따라 변환)
        let quietnessScore = 98;
        if (rating === 4) quietnessScore = 92;
        else if (rating === 3) quietnessScore = 85;
        else if (rating === 2) quietnessScore = 78;
        else if (rating === 1) quietnessScore = 65;
        
        let congestion = "매우 한적함";
        if (quietnessScore < 90) {
            congestion = "한적함";
        }
        
        // 선택된 태그 목록 수집
        const selectedTags = [];
        const activeChips = DOM.formTagChips.querySelectorAll('.form-tag-chip.active');
        activeChips.forEach(chip => {
            selectedTags.push(chip.dataset.tag);
        });
        
        // 만약 선택된 태그가 없다면 기본적으로 "조용한" 부여
        if (selectedTags.length === 0) {
            selectedTags.push("조용한");
        }
        
        // 새로운 정원 데이터 객체 생성
        const newPark = {
            id: `park-user-${Date.now()}`, // 고유 ID 부여
            name: name,
            lat: lat,
            lng: lng,
            quietnessScore: quietnessScore,
            congestion: congestion,
            tags: selectedTags,
            description: comment || `이곳은 사용자가 제보한 정원입니다. 고요함 점수 ${quietnessScore}점의 아늑하고 평화로운 공간입니다.`,
            distance: distance,
            walkTime: walkTime
        };
        
        // 데이터 적재 및 UI 갱신
        state.allParks.unshift(newPark); // 새로 제보한 것을 맨 위에 노출하도록 unshift
        filterAndRenderParks();
        
        // 성공 처리
        showToast(`새로운 정원 '${name}'이(가) 성공적으로 제보되었습니다!`);
        closeAddGardenSheet();
    });
}

// 별점 상태 업데이트 헬퍼
function updateRatingStars(rating) {
    DOM.gardenRating.value = rating;
    const starButtons = DOM.ratingStars.querySelectorAll('.star-btn');
    starButtons.forEach(btn => {
        const val = parseInt(btn.dataset.value);
        const icon = btn.querySelector('i');
        if (val <= rating) {
            btn.classList.add('active');
            icon.className = 'fa-solid fa-star';
        } else {
            btn.classList.remove('active');
            icon.className = 'fa-regular fa-star';
        }
    });
}
