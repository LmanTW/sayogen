import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { JSX } from 'preact/jsx-runtime'
import { CSSProperties } from 'preact'
import * as lucid from 'lucide-preact'

import { GeneratorPanelState } from './GeneratorPanel'
import { EntryListState } from './EntryList'

const isInferencing = signal<boolean>(false)
const isTriggeringMaskRender = signal<boolean>(false)

const maskCanvas = document.createElement('canvas')
const maskContext = maskCanvas.getContext('2d')!

const selectedCanvas = document.createElement('canvas')
const selectedContext = selectedCanvas.getContext('2d')!

// The labeling step component.
export default (properties: { style?: CSSProperties }): JSX.Element => {
  if (GeneratorPanelState.currentStep.value.step != 'labeling' || EntryListState.summary.value === null) {
    throw new Error("Invalid Generator State")
  }

  const menuElement = useRef<HTMLDivElement>(null)
  const mainCanvasElement = useRef<HTMLCanvasElement>(null)

  const [selectedClassID, setSelectedClassID] = useState<string>((EntryListState.summary.value.classes.length === 0) ? 'new' : '@' + EntryListState.summary.value.classes[0].name)
  const [selectedObject, setSelectedObject] = useState<null | number>(null)
  const [selectedPoint, setSelectedPoint] = useState<null | number>(null)

  const imageElement = useRef<HTMLImageElement>(new Image()) 
  const newTemporaryClassNames = useRef<string[]>([])
 
  const rendererState = useRef<RendererState>({
    offsetX: 0,
    offsetY: 0,
    scale: 1
  })

  const controllerState = useRef<ControllerState>({
    isMouseDown: false,
    startDragX: 0,
    startDragY: 0,
    pressTimestamp: 0,
    pressStartX: 0,
    pressStartY: 0,
    selectedPoint: null
  })

  // Select a class.
  const selectClass = (classID: string): void => {
    let className!: string

    if (classID === 'new') {
      const newClassName = prompt('Enter the name of the new class:')

      if (newClassName === null) {
        return
      }

      if (!EntryListState.hasClass(newClassName) && !newTemporaryClassNames.current.includes(newClassName)) {
        newTemporaryClassNames.current.push(newClassName)
      }

      className = newClassName
    } else {
      className = classID.substring(1)
    }
    
    if (selectedObject !== null && GeneratorPanelState.currentStep.value.step === 'labeling') {
      GeneratorPanelState.currentStep.value.objects[selectedObject].className = className

      GeneratorPanelState.updateSelectionStep({ objects: GeneratorPanelState.currentStep.value.objects })
    }

    setSelectedClassID('@' + className)
  }

  // Select an object.
  const selectObject = (index: null | number): void => {
    if (index === selectedObject) {
      setSelectedObject(null)
    } else {
      setSelectedObject(index)
    } 

    if (selectedObject !== null && GeneratorPanelState.currentStep.value.step === 'labeling') {
      setSelectedClassID('@' + GeneratorPanelState.currentStep.value.objects[selectedObject].className) 
    }

    renderMaskCanvas()
    renderSelectedCanvas()
    renderCanvas()
  }

  // Add an object.
  const addObject = (): void => {
    if (GeneratorPanelState.currentStep.value.step === 'labeling' && EntryListState.summary.value !== null) {
      if (selectedClassID === 'new') {
        const className = prompt('Enter the name of the new class:')

        if (className !== null) {
          GeneratorPanelState.currentStep.value.objects.push({
            className: className,
            points: [],

            maskImage: null,
            lastUpdateTimestamp: null
          })

          if (!newTemporaryClassNames.current.includes(className)) {
            newTemporaryClassNames.current.push(className)
          }
        }
      } else {
        GeneratorPanelState.currentStep.value.objects.push({
          className: selectedClassID.substring(1),
          points: [],

          maskImage: null,
          lastUpdateTimestamp: null
        })
      }

      GeneratorPanelState.updateSelectionStep({ objects: GeneratorPanelState.currentStep.value.objects })

      selectObject(GeneratorPanelState.currentStep.value.objects.length - 1)
    }
  }

  // Remove an object.
  const removeObject = (index: number): void => {
    if (GeneratorPanelState.currentStep.value.step === 'labeling') {
      if (confirm(`Confirm to remove the "${GeneratorPanelState.currentStep.value.objects[index].className}" object.`)) {
        if (index === selectedObject) {
          selectObject(null)
        }

        const object = GeneratorPanelState.currentStep.value.objects[index]

        if (object.maskImage !== null) { 
          URL.revokeObjectURL(object.maskImage.src)
        }

        GeneratorPanelState.currentStep.value.objects.splice(index, 1)

        GeneratorPanelState.updateSelectionStep({ objects: GeneratorPanelState.currentStep.value.objects })
      }
    }
  }

  // Render the canvas.
  const renderCanvas = (): void => {
    if (mainCanvasElement.current === null) {
      return
    }

    const mainContext = mainCanvasElement.current.getContext('2d')!

    mainContext.clearRect(0, 0, mainCanvasElement.current.width, mainCanvasElement.current.height)

    if (menuElement.current === null) {
      return
    }

    const renderDimension = calculateImageRenderDimension()

    mainContext.drawImage(imageElement.current, renderDimension.x, renderDimension.y, renderDimension.width, renderDimension.height)

    mainContext.globalAlpha = 0.5

    mainContext.drawImage(maskCanvas, renderDimension.x, renderDimension.y, renderDimension.width, renderDimension.height)
    mainContext.drawImage(selectedCanvas, renderDimension.x, renderDimension.y, renderDimension.width, renderDimension.height)

    mainContext.globalAlpha = 1

    if (GeneratorPanelState.currentStep.value.step !== 'labeling' || selectedObject === null) {
      return
    }

    mainContext.fillStyle = 'rgba(255,0,0,0.5)'

    for (const point of GeneratorPanelState.currentStep.value.objects[selectedObject].points) {
      const renderX = renderDimension.x + (point.x / imageElement.current.naturalWidth) * renderDimension.width
      const renderY = renderDimension.y + (point.y / imageElement.current.naturalHeight) * renderDimension.height

      mainContext.beginPath()
      mainContext.arc(renderX, renderY, (window.innerWidth + window.innerHeight) / 400, 0, Math.PI * 2)
      mainContext.fill()
    }
  }

  // Render the mask canvas.
  const renderMaskCanvas = (): void => {
    maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)

    if (GeneratorPanelState.currentStep.value.step !== 'labeling' || GeneratorPanelState.currentStep.value.objects.length < 2) {
      return
    }

    let isAnyMaskFound: boolean = false

    for (let index = 0; index < GeneratorPanelState.currentStep.value.objects.length; index++) {
      if (index != selectedObject) {
        const object = GeneratorPanelState.currentStep.value.objects[index]

        if (object.maskImage !== null) {
          maskContext.drawImage(object.maskImage, 0, 0)

          isAnyMaskFound = true
        }
      } 
    }

    if (!isAnyMaskFound) {
      return
    }

    const maskImageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height)

    const emptyPixel = new Uint8Array([0, 0, 0, 0])
    const greenPixel = new Uint8Array([0, 255, 0, 255])

    for (let offset = 0; offset < maskImageData.data.length; offset += 4) {
      maskImageData.data.set((maskImageData.data[offset + 3] === 0) ? emptyPixel : greenPixel, offset)
    }

    maskContext.putImageData(maskImageData, 0, 0)
  }

  // Render the selected canvas.
  const renderSelectedCanvas = (): void => {
    selectedContext.clearRect(0, 0, selectedCanvas.width, selectedCanvas.height)

    if (GeneratorPanelState.currentStep.value.step !== 'labeling' || GeneratorPanelState.currentStep.value.objects.length === 0) {
      return
    }

    let isAnyMaskFound: boolean = false

    for (let index = 0; index < GeneratorPanelState.currentStep.value.objects.length; index++) {
      if (index == selectedObject) {
        const object = GeneratorPanelState.currentStep.value.objects[index]

        if (object.maskImage !== null) {
          selectedContext.drawImage(object.maskImage, 0, 0)

          isAnyMaskFound = true
        }

        break
      } 
    }

    if (!isAnyMaskFound) {
      return
    }

    const selectedImageData = selectedContext.getImageData(0, 0, selectedCanvas.width, selectedCanvas.height)

    const emptyPixel = new Uint8Array([0, 0, 0, 0])
    const yellowPixel = new Uint8Array([255, 255, 0, 255])

    for (let offset = 0; offset < selectedImageData.data.length; offset += 4) {
      selectedImageData.data.set((selectedImageData.data[offset + 3] === 0) ? emptyPixel : yellowPixel, offset)
    }

    selectedContext.putImageData(selectedImageData, 0, 0)
  }

  // Resize the canvas.
  const resizeCanvas = (): void => {
    if (mainCanvasElement.current === null) {
      return
    }

    const canvasBound = mainCanvasElement.current.getBoundingClientRect()

    mainCanvasElement.current.width = canvasBound.width
    mainCanvasElement.current.height = canvasBound.height

    maskCanvas.width = imageElement.current.naturalWidth
    maskCanvas.height = imageElement.current.naturalHeight
    selectedCanvas.width = imageElement.current.naturalWidth
    selectedCanvas.height = imageElement.current.naturalHeight

    rendererState.current.offsetX = 0
    rendererState.current.offsetY = 0
    rendererState.current.scale = 1

    renderCanvas()
  }

  // calculate the render dimension of the image.
  const calculateImageRenderDimension = (): RenderDimension => {
    if (menuElement.current === null || mainCanvasElement.current === null) {
      throw new Error('Interface Not Mounted')
    } 

    const menuBound = menuElement.current.getBoundingClientRect()
    const canvasBound = mainCanvasElement.current.getBoundingClientRect()

    const imageRatio = imageElement.current.naturalWidth / imageElement.current.naturalHeight
    const canvasRatio = (canvasBound.width - (menuBound.left + menuBound.width)) / canvasBound.height

    let renderWidth!: number
    let renderHeight!: number

    if (canvasRatio > imageRatio) {
      renderHeight = canvasBound.height * 0.95
      renderWidth = renderHeight * imageRatio
    } else {
      renderWidth = (canvasBound.width - (menuBound.left + menuBound.width)) * 0.95
      renderHeight = renderWidth / imageRatio
    }

    renderWidth *= rendererState.current.scale
    renderHeight *= rendererState.current.scale

    return {
      x: (((menuBound.left + menuBound.width) + (canvasBound.width - renderWidth)) / 2) + rendererState.current.offsetX,
      y: ((canvasBound.height - renderHeight) / 2) + rendererState.current.offsetY,
      width: renderWidth,
      height: renderHeight
    }
  }

  // Calculate the cursor position on the image.
  const calculateImageCursorPosition = (clientX: number, clientY: number): { x: number, y: number } => {
    if (mainCanvasElement.current === null) {
      throw new Error('Interface Not Mounted')
    } 

    const canvasBound = mainCanvasElement.current.getBoundingClientRect()
    const renderTransform = calculateImageRenderDimension()

    const mouseX = clientX - canvasBound.left
    const mouseY = clientY - canvasBound.top

    return {
      x: ((mouseX - renderTransform.x) / renderTransform.width) * imageElement.current.naturalWidth,
      y: ((mouseY - renderTransform.y) / renderTransform.height) * imageElement.current.naturalHeight
    }
  }

  // Continue to the next step.
  const continueNextStep = (): void => {
    if (GeneratorPanelState.currentStep.value.step === 'labeling') {
      if (GeneratorPanelState.currentStep.value.objects.find((object) => object.points.length > 0) === undefined) {
        confirm("There must be at least one labeled object.")

        return
      }

      GeneratorPanelState.setCurrentStep({ step: 'rendering' })
    }
  }

  useEffect(() => {

    // Handle mouse down.
    const handleMouseDown = (event: MouseEvent): void => {
      if (event.button === 0) {
        const renderTransform = calculateImageRenderDimension()

        controllerState.current.isMouseDown = true
        controllerState.current.startDragX = event.clientX - rendererState.current.offsetX
        controllerState.current.startDragY = event.clientY - rendererState.current.offsetY
        controllerState.current.pressTimestamp = performance.now()
        controllerState.current.pressStartX = event.clientX
        controllerState.current.pressStartY = event.clientY
        controllerState.current.selectedPoint = null  

        if (selectedObject !== null && GeneratorPanelState.currentStep.value.step === 'labeling') {
          const cursorPosition = calculateImageCursorPosition(event.clientX, event.clientY)

          for (let index = 0; index < GeneratorPanelState.currentStep.value.objects[selectedObject].points.length; index++) {
            const point = GeneratorPanelState.currentStep.value.objects[selectedObject].points[index]
            const threshold = ((window.innerWidth + window.innerHeight) / 400) / (renderTransform.width / imageElement.current.naturalWidth)

            if (Math.hypot(point.x - cursorPosition.x, point.y - cursorPosition.y) < threshold * 1.5) {
              setSelectedPoint(index)

              break
            }
          }
        }
      }
    }

    // Handle mouse down.
    const handleMouseUp = (event: MouseEvent): void => {
      if (event.button === 0) { 
        controllerState.current.isMouseDown = false

        if (GeneratorPanelState.currentStep.value.step !== 'labeling') {
          return
        }

        if (GeneratorPanelState.currentStep.value.objects.length === 0) {
          addObject()
        }

        if (selectedObject === null) {
          return
        }

        if (performance.now() - controllerState.current.pressTimestamp < 250 && (Math.abs(controllerState.current.pressStartX - event.clientX) < 10 && Math.abs(controllerState.current.pressStartY - event.clientY) < 10)) {
          if (selectedPoint === null) {
            const pointPosition = calculateImageCursorPosition(controllerState.current.pressStartX, controllerState.current.pressStartY)

            GeneratorPanelState.currentStep.value.objects[selectedObject].points.push({
              x: pointPosition.x,
              y: pointPosition.y
            })
          } else {
            GeneratorPanelState.currentStep.value.objects[selectedObject].points.splice(selectedPoint, 1)
          }

          GeneratorPanelState.currentStep.value.objects[selectedObject].lastUpdateTimestamp = performance.now()

          renderCanvas()
        }
      }
    }

    // Handle mouse down.
    const handleMouseMove = (event: MouseEvent): void => {
      if (controllerState.current.isMouseDown) {
        if (selectedPoint === null || selectedObject === null || GeneratorPanelState.currentStep.value.step !== 'labeling') {
          rendererState.current.offsetX = event.clientX - controllerState.current.startDragX
          rendererState.current.offsetY = event.clientY - controllerState.current.startDragY
        } else {
          const cursorPosition = calculateImageCursorPosition(event.clientX, event.clientY)

          GeneratorPanelState.currentStep.value.objects[selectedObject].points[selectedPoint] = {
            x: cursorPosition.x,
            y: cursorPosition.y
          }

          GeneratorPanelState.currentStep.value.objects[selectedObject].lastUpdateTimestamp = performance.now()
        }

        renderCanvas()
      }
    }

    let zoomLevel: number = 1

    // Handle mouse wheel.
    const handleMouseWheel = (event: WheelEvent): void => {
      event.preventDefault()

      if (mainCanvasElement.current === null) {
        return
      }

      const bound = mainCanvasElement.current.getBoundingClientRect()
      const mouseX = event.clientX - bound.left
      const mouseY = event.clientY - bound.top

      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
      const newZoomLevel = Math.max(0.1, Math.min(10, zoomLevel * zoomFactor))

      if (newZoomLevel === zoomLevel) {
        return
      }

      const currentTransform = calculateImageRenderDimension()

      const ratioX = (mouseX - currentTransform.x) / currentTransform.width
      const ratioY = (mouseY - currentTransform.y) / currentTransform.height

      const oldWidth = currentTransform.width
      const oldHeight = currentTransform.height

      rendererState.current.scale *= (newZoomLevel / zoomLevel)

      const newTransform = calculateImageRenderDimension()

      rendererState.current.offsetX -= (newTransform.width - oldWidth) * (ratioX - 0.5)
      rendererState.current.offsetY -= (newTransform.height - oldHeight) * (ratioY - 0.5)

      if (controllerState.current.isMouseDown) {
        controllerState.current.startDragX = event.clientX - rendererState.current.offsetX
        controllerState.current.startDragY = event.clientY - rendererState.current.offsetY
      }

      renderCanvas()
    }

    // Handle the context menu.
    const handleContextMenu = (event: MouseEvent): void => {
      event.preventDefault()
    }

    window.addEventListener('resize', resizeCanvas)

    if (GeneratorPanelState.currentStep.value.step === 'labeling' && imageElement.current.src !== GeneratorPanelState.currentStep.value.selectedImageURL) {
      imageElement.current.addEventListener('load', resizeCanvas, { once: true })

      imageElement.current.src = GeneratorPanelState.currentStep.value.selectedImageURL
    }

    if (mainCanvasElement.current !== null) {
      mainCanvasElement.current.addEventListener('mousedown', handleMouseDown)
      mainCanvasElement.current.addEventListener('mouseup', handleMouseUp)
      mainCanvasElement.current.addEventListener('mousemove', handleMouseMove)
      mainCanvasElement.current.addEventListener('wheel', handleMouseWheel)
      mainCanvasElement.current.addEventListener('contextmenu', handleContextMenu)
    }

    const unsubscribeMaskRenderTrigger = isTriggeringMaskRender.subscribe((renderMask) => {
      if (renderMask) {
        isTriggeringMaskRender.value = false
  
        renderMaskCanvas()
        renderSelectedCanvas()
        renderCanvas()
      }
    })

    return () => {
      window.removeEventListener('resize', resizeCanvas)

      if (mainCanvasElement.current !== null) {
        mainCanvasElement.current.removeEventListener('mousedown', handleMouseDown)
        mainCanvasElement.current.removeEventListener('mouseup', handleMouseUp)
        mainCanvasElement.current.removeEventListener('mousemove', handleMouseMove)
        mainCanvasElement.current.removeEventListener('wheel', handleMouseWheel)
        mainCanvasElement.current.removeEventListener('contextmenu', handleContextMenu)
      }

      unsubscribeMaskRenderTrigger()
    }
  })

  return (
    <div style={Object.assign({ position: 'relative', display: 'flex' }, (properties.style === undefined) ? {} : properties.style)}>
      <canvas ref={mainCanvasElement} style={{ width: '100%', minWidth: '0rem', height: '100%', minHeight: '0rem', padding: '0rem' }}></canvas>

      <div ref={menuElement} class='container-shadow' style={{ position: 'absolute', display: 'flex', flexDirection: 'column', border: 'var(--border-style-muted)', borderRadius: 'var(--border-radius-big)', left: 'var(--space-medium)', top: 'var(--space-medium)', width: '10%', minWidth: '20rem', height: 'calc(100% - calc(var(--space-medium) * 2))', overflow: 'hidden' }}>
        <div class='container-glassy-muted' style={{ display: 'flex', borderStyle: 'none none solid none', height: '3rem' }}>
          <div style={{ flex: 1, border: 'var(--border-style-muted)', borderStyle: 'none solid none none', paddingInline: 'var(--space-medium)' }}>
            {
              (EntryListState.summary.value === null) ? (
                <select disabled={true} style={{ color: 'color-mix(in srgb, var(--color-foreground), transparent 50%)', backgroundColor: 'transparent', border: 'none', fontSize: 'var(--size-small)', width: '100%', height: '100%', cursor: 'not-allowed' }}>
                  <option>{EntryListState.summaryStatus.value}</option>
                </select>
              ) : (
                <select value={selectedClassID} disabled={EntryListState.summaryLocked.value || EntryListState.pageContentLocked.value} onChange={(event) => selectClass((event.target as HTMLSelectElement).value)} style={{ color: (EntryListState.summaryLocked.value || EntryListState.pageContentLocked.value) ? 'color-mix(in srgb, var(--color-foreground), transparent 50%)' : 'var(--color-foreground)', backgroundColor: 'transparent', border: 'none', fontSize: 'var(--size-small)', width: '100%', height: '100%', cursor: (EntryListState.summaryLocked.value) ? 'not-allowed' : 'pointer' }}>
                  {
                    [(<option value='new'>New Class</option>)]
                      .concat(newTemporaryClassNames.current.map((className) => (<option value={'@' + className}>{className}</option>)))
                      .concat(EntryListState.summary.value.classes.map((classInfo) => (<option value={'@' + classInfo.name}>{classInfo.name}</option>)))
                  }
                </select>
              )
            } 
          </div>

          <button title="Add Object" onClick={addObject} class='button-transparent' style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '3rem', height: '3rem' }}>
            <lucid.Plus/>
          </button>
        </div>

        <div class='container-glassy-dark' style={{ flex: 1, border: 'var(--border-style-muted)', borderStyle: 'none none solid none', overflowX: 'hidden', overflowY: 'auto' }}>
          {
            GeneratorPanelState.currentStep.value.objects.map((object, index, objects) => (
              <div style={{ display: 'flex', border: (index === objects.length - 1) ? 'var(--border-style-dark)' : undefined, borderStyle: (index === objects.length - 1) ? 'none none solid none' : undefined }}>
                <button onClick={() => selectObject(index)} class='button-transparent' style={{ flex: 1, display: 'flex', alignItems: 'center', backgroundColor: (selectedObject === index) ? 'var(--color-highlight-dark)' : undefined, border: 'var(--border-style-muted)', borderStyle: 'none solid none none', width: '100%', padding: 'var(--space-small)' }}>
                  <lucid.Shapes size={20} style={{ flexShrink: 0, marginRight: 'var(--space-small)' }}/>
                  <p style={{ flex: 1, textAlign: 'start' }}>{object.className}</p>
                </button>

                <button onClick={() => removeObject(index)} class='button-transparent' style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '3rem' }}>
                  <lucid.Trash size={20}/>
                </button>
              </div>
            ))
          }
        </div>

        <div class='container-glassy-muted' style={{ border: 'none' }}>
          {
            (isInferencing.value) ? (
              <button class='button-transparent' disabled={true} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '3rem' }}>
                <p style={{ marginRight: 'var(--space-small)' }}>Inferencing</p>
                <lucid.LoaderCircle style={{ animation: '1s var(--ease-outQuint) infinite loading-spinner' }}/>
              </button>
            ) : (
              <button class='button-transparent' onClick={continueNextStep} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '3rem' }}>
                <p style={{ marginRight: 'var(--space-small)' }}>Continue</p>
                <lucid.ArrowRight/>
              </button>
            )
          }
        </div>
      </div> 
    </div> 
  ) 
}

// Update the generator state.
async function updateTick(): Promise<void> {
  if (GeneratorPanelState.currentStep.value.step === 'labeling') {
    for (const object of GeneratorPanelState.currentStep.value.objects) {
      if (object.lastUpdateTimestamp !== null && performance.now() - object.lastUpdateTimestamp > 750) {
        isInferencing.value = true

        object.lastUpdateTimestamp = null

        if (object.points.length === 0) {
          if (object.maskImage !== null) { 
            URL.revokeObjectURL(object.maskImage.src)
          }

          object.maskImage = null

          isTriggeringMaskRender.value = true

          continue
        }

        try {
          const inferenceResponse = await fetch(`/inference/sam2?points=${encodeURIComponent(object.points.map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`).join(','))}`, {
            method: 'POST',
            body: GeneratorPanelState.currentStep.value.selectedImageBlob
          })

          if (inferenceResponse.status !== 200) {
            return
          }

          if (object.maskImage === null) {
            object.maskImage = new Image()
          } else { 
            URL.revokeObjectURL(object.maskImage.src)
          }

          object.maskImage.addEventListener('load', () => isTriggeringMaskRender.value = true, { once: true })

          object.maskImage!.src = URL.createObjectURL(await inferenceResponse.blob())
        } catch (error) {
          console.error(error)
        } 
      }
    }

    isInferencing.value = false
  }

  setTimeout(updateTick, 100)
}

window.addEventListener('load', () => updateTick(), { once: true })

// The renderer state for a labeling step.
interface RendererState {
  offsetX: number,
  offsetY: number,
  scale: number
}

// The controller state for a labeling step.
interface ControllerState {
  isMouseDown: boolean
  startDragX: number
  startDragY: number
  pressTimestamp: number
  pressStartX: number
  pressStartY: number
  selectedPoint: null | number
}

// A render dimension.
interface RenderDimension {
  x: number,
  y: number,
  width: number,
  height: number
}
