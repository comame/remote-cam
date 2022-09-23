const cameraButton = document.getElementById('camera')
const offerButton = document.getElementById('offer')
/** @type { HTMLVideoElement } */
const videoElement = document.getElementById('video') /** @type { HTMLVideoElement } */
/** @type { HTMLSelectElement } */
const selectElement = document.getElementById('select')

const defaultResolutions = [
    [ 'USB3.0 Capture Video', 1920, 1080 ]
]

let sendVideo = false

const signaling = new WebSocket('wss:webrtc.comame.dev/signaling')

function postMessage(message) {
    signaling.send(JSON.stringify(message))
}

/** @type { RTCPeerConnection } */
let peer = null
/** @type { MediaStream } */
let mediaStream = null

let cameraAccess = true

navigator.permissions.query({ name: 'camera' }).then(status => {
    switch (status.state) {
        case 'denied': {
            cameraAccess = false
            showError('カメラへのアクセスを許可してください')
            break
        }
        case 'prompt': {
            cameraAccess = false
            showError('CAMERA ボタンを押して、カメラへのアクセスを許可してください')
        }
    }
 }).finally(navigator.mediaDevices.enumerateDevices().then((devices) => {
    devices.filter(it => it.kind === 'videoinput').forEach(videoDevice => {
        const item = document.createElement('option')
        item.value = videoDevice.deviceId
        item.textContent = videoDevice.label
        selectElement.add(item)

        if (cameraAccess && videoDevice.label === '') {
            showError('デバイス名を表示するには、カメラへの永続アクセスを許可してください')
        }
    })
}))

signaling.addEventListener('message', async (e) => {
    let data
    if (typeof e.data === 'string') {
        data = JSON.parse(e.data)
    } else {
        // buffer
        data = JSON.parse(await e.data.text())
    }
    switch (data.type) {
        case 'offer':
            handleOffer(data)
            break
        case 'answer':
            handleAnswer(data)
            break
        case 'candidate':
            handleCandidate(data)
            break
    }
})

cameraButton.addEventListener('click', async () => {
    sendVideo = true

    const videoConstraint = {
        deviceId: selectElement.value
    }

    const defaultResolution = defaultResolutions
        .find(r => selectElement.options[selectElement.selectedIndex].text.startsWith(r[0]))

    console.log(defaultResolution)

    if (defaultResolution) {
        videoConstraint.width = defaultResolution[1]
        videoConstraint.height = defaultResolution[2]
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraint
    })

    mediaStream = stream

    videoElement.srcObject = stream
    videoElement.play()

    const { width, height, frameRate } = stream.getVideoTracks()[0].getSettings()
    videoElement.width = width
    videoElement.height = height
})

offerButton.addEventListener('click', async () => {
    await preparePeerConnection()
    const offer = await peer.createOffer()
    postMessage({ type: 'offer', sdp: offer.sdp })
    await peer.setLocalDescription(offer)
})

async function preparePeerConnection() {
    peer = new RTCPeerConnection({
        iceServers: [{
            urls: [ 'stun:stun.comame.dev:3478' ]
        }, {
            urls: [ 'stun:stun.l.google.com:19302' ]
        }]
    })

    if (sendVideo) {
        mediaStream.getTracks().forEach(track => {
            peer.addTrack(track, mediaStream)
        })
    } else {
        peer.addEventListener('track', (e) => {
            videoElement.srcObject = e.streams[0]
            videoElement.play()
        })
    }

    peer.addEventListener('icecandidate', (e) => {
        const message = {
            type: 'candidate',
            candidate: null,
            sendVideo
        }
        if (e.candidate) {
            message.candidate = e.candidate.candidate
            message.sdpMid = e.candidate.sdpMid
            message.sdpMLineIndex = e.candidate.sdpMLineIndex
        }
        postMessage(message)
    })
}

async function handleOffer(offer) {
    await preparePeerConnection()
    peer.setRemoteDescription(offer)
    const answer = await peer.createAnswer()
    postMessage({ type: 'answer', sdp: answer.sdp })
    await peer.setLocalDescription(answer)
}

async function handleAnswer(answer) {
    await peer.setRemoteDescription(answer)
}

async function handleCandidate(candidate) {
    if (!candidate.candidate) {
        await peer.addIceCandidate(null)
    } else {
        await peer.addIceCandidate(candidate)
    }
}

function showError(msg) {
    console.error(msg)
    const element = document.createElement('div')
    element.classList.add('error')
    element.textContent = msg
    document.body.appendChild(element)
    setTimeout(() => {
        document.body.removeChild(element)
    }, 3000)
}
