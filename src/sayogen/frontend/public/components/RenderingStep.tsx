import { useEffect, useRef, useState } from 'preact/hooks'
import { signal, batch } from '@preact/signals'
import { JSX } from 'preact/jsx-runtime'
import { CSSProperties } from 'preact'
import * as lucid from 'lucide-preact'
import * as three from 'three'

import { GeneratorPanelState } from './GeneratorPanel'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'

import testSceneURL from '../assets/scene.glb'

function sampleUpwardPositions(scene: three.Scene, maxPoints: number): Float32Array {
  interface Tri {
    a: three.Vector3; b: three.Vector3; c: three.Vector3;
    normal: three.Vector3; area: number
  }

  const tris: Tri[] = []
  const meshes: three.Mesh[] = []
  const up = new three.Vector3(0, 1, 0)
  const ab = new three.Vector3()
  const ac = new three.Vector3()
  const v = new three.Vector3()
  const crossVal = new three.Vector3()
  const UP_THRESHOLD = Math.cos(45 * Math.PI / 180)
  const MIN_AREA = 0.25

  scene.updateMatrixWorld(true)
  scene.traverse((child) => {
    if (!(child instanceof three.Mesh)) return
    meshes.push(child)
    const geo = child.geometry
    if (!geo) return
    const pos = geo.getAttribute('position') as three.BufferAttribute | null
    if (!pos) return

    const worldMat = child.matrixWorld
    const index = geo.getIndex()

    const getV = (i: number): three.Vector3 => {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(worldMat)
      return v.clone()
    }
    const proc = (i0: number, i1: number, i2: number) => {
      const a = getV(i0); const b = getV(i1); const c = getV(i2)
      ab.subVectors(b, a); ac.subVectors(c, a); crossVal.crossVectors(ab, ac)
      const area = crossVal.length() / 2
      if (area > MIN_AREA) {
        const n = crossVal.clone().normalize()
        if (n.dot(up) > UP_THRESHOLD) {
          tris.push({ a, b, c, normal: n, area })
        }
      }
    }

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        proc(index.getX(i), index.getX(i + 1), index.getX(i + 2))
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) proc(i, i + 1, i + 2)
    }
  })

  if (tris.length === 0) return new Float32Array(0)

  const raycaster = new three.Raycaster()
  const origin = new three.Vector3()
  const dir = new three.Vector3()
  const totalArea = tris.reduce((s, t) => s + t.area, 0)
  const weights = tris.map(t => t.area / totalArea)
  const count = Math.min(maxPoints, tris.length * 3)
  const positions: number[] = []
  const EPSILON = 0.01
  const INTERNAL_DIST = 0.15

  while (positions.length / 3 < count) {
    const r = Math.random()
    let cum = 0; let idx = 0
    for (let j = 0; j < weights.length; j++) {
      cum += weights[j]
      if (r <= cum) { idx = j; break }
    }
    const tri = tris[idx]
    let u = Math.random(); let w = Math.random()
    if (u + w > 1) { u = 1 - u; w = 1 - w }
    const vv = 1 - u - w

    const px = u * tri.a.x + w * tri.b.x + vv * tri.c.x
    const py = u * tri.a.y + w * tri.b.y + vv * tri.c.y
    const pz = u * tri.a.z + w * tri.b.z + vv * tri.c.z

    origin.set(px, py, pz)
    dir.copy(tri.normal)
    raycaster.set(origin, dir)
    const hits = raycaster.intersectObjects(meshes, true)
    let internal = false
    for (const hit of hits) {
      if (hit.distance > EPSILON && hit.distance < INTERNAL_DIST) {
        internal = true
        break
      }
    }

    if (!internal) {
      positions.push(px, py, pz)
    }
  }

  return new Float32Array(positions)
}

export default (properties: { style?: CSSProperties }): JSX.Element => {
  if (GeneratorPanelState.currentStep.value.step != 'rendering') {
    throw new Error("Invalid Generator State")
  }

  const scene = useRef<three.Scene>(new three.Scene())
  scene.current.background = new three.Color(0x95c6f5)
  scene.current.add(new three.AmbientLight(0xffffff, 0.15))
  const sun = new three.DirectionalLight(0xffffff, 2.5)
  sun.position.set(10, 15, 10)
  sun.castShadow = true
  sun.shadow.mapSize.width = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 50
  sun.shadow.camera.left = -15
  sun.shadow.camera.right = 15
  sun.shadow.camera.top = 15
  sun.shadow.camera.bottom = -15
  scene.current.add(sun)

  const canvasReference = useRef<HTMLCanvasElement>(null)
  const camera = useRef<three.PerspectiveCamera>(
    new three.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  )
  camera.current.position.set(0, 1.6, 5)

  const keys = useRef<Set<string>>(new Set())

  const MOVE_SPEED = 0.05
  const ROTATION_SPEED = 0.05

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    if (canvasReference.current === null) return

    const renderer = new three.WebGLRenderer({
      canvas: canvasReference.current,
      antialias: true
    })
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = three.PCFSoftShadowMap
    renderer.setSize(window.innerWidth, window.innerHeight)

    camera.current.rotation.order = 'YXZ'
    let yaw = 0
    let pitch = 0

    let animId: number

    const animate = () => {
      const k = keys.current
      const cam = camera.current

      if (k.has('ArrowLeft')) yaw += ROTATION_SPEED
      if (k.has('ArrowRight')) yaw -= ROTATION_SPEED
      if (k.has('ArrowUp')) pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + ROTATION_SPEED))
      if (k.has('ArrowDown')) pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch - ROTATION_SPEED))
      cam.rotation.y = yaw
      cam.rotation.x = pitch

      const forward = new three.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
      forward.y = 0
      forward.normalize()

      const right = new three.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
      right.y = 0
      right.normalize()

      if (k.has('KeyW')) cam.position.add(forward.clone().multiplyScalar(MOVE_SPEED))
      if (k.has('KeyS')) cam.position.add(forward.clone().multiplyScalar(-MOVE_SPEED))
      if (k.has('KeyA')) cam.position.add(right.clone().multiplyScalar(-MOVE_SPEED))
      if (k.has('KeyD')) cam.position.add(right.clone().multiplyScalar(MOVE_SPEED))
      if (k.has('KeyQ')) cam.position.y -= MOVE_SPEED
      if (k.has('KeyE')) cam.position.y += MOVE_SPEED

      renderer.render(scene.current, cam)
      animId = requestAnimationFrame(animate)
    }

    const loadAndAnimate = async () => {
      const gltf = await new GLTFLoader().loadAsync(testSceneURL)
      gltf.scene.traverse((child) => {
        if (child instanceof three.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      scene.current.add(gltf.scene)
      const positions = sampleUpwardPositions(scene.current, 1024)
      if (positions.length > 0) {
        const geo = new three.BufferGeometry()
        geo.setAttribute('position', new three.BufferAttribute(positions, 3))
        const mat = new three.PointsMaterial({ color: 0x00ff00, size: 0.1 })
        scene.current.add(new three.Points(geo, mat))
      }
      animId = requestAnimationFrame(animate)
    }

    loadAndAnimate()

    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div style={Object.assign({ position: 'relative', display: 'flex' }, (properties.style === undefined) ? {} : properties.style)}>
      <canvas ref={canvasReference} style={{ width: '100%', minWidth: '0rem', height: '100%', minHeight: '0rem', padding: '0rem' }}></canvas>
    </div>
  )
}
