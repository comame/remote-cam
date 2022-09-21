const cameraButton = document.getElementById('camera')
const offerButton = document.getElementById('offer')
const adjustButton = document.getElementById('adjust')
/** @type { HTMLVideoElement } */
const videoElement = document.getElementById('video')
const selectElement = document.getElementById('select')

let sendVideo = false

const signaling = new WebSocket('wss:webrtc.comame.dev/signaling')

function postMessage(message) {
    signaling.send(JSON.stringify(message))
}

/** @type { RTCPeerConnection } */
let peer = null
/** @type { MediaStream } */
let mediaStream = null

navigator.mediaDevices.enumerateDevices().then((devices) => {
    devices.filter(it => it.kind === 'videoinput').forEach(videoDevice => {
        const item = document.createElement('option')
        item.value = videoDevice.deviceId
        item.text = videoDevice.label
        selectElement.add(item)
    })
})

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

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            deviceId: selectElement.value
        }
    })

    mediaStream = stream

    videoElement.srcObject = stream
    videoElement.play()

    const { width, height, frameRate } = stream.getVideoTracks()[0].getSettings()
    console.log(frameRate, width, height)
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

adjustButton.addEventListener('click', () => {
    adjustVideoSize()
})

function adjustVideoSize() {
    const transceivers = peer.getTransceivers()
    const videoTransceivers = transceivers.filter(it => it.receiver.track.kind === 'video')
    if (videoTransceivers.length === 0) {
        return
    }
    const { width, height } = videoTransceivers[0].receiver.track.getSettings()
    videoElement.width = width
    videoElement.height = height
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
