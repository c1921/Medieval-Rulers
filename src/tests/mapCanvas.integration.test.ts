import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMapStore } from '../stores/mapStore'

const rendererRenderSpy = vi.fn()
const rendererAttachSpy = vi.fn()
const rendererDetachSpy = vi.fn()
const rendererDestroySpy = vi.fn()

vi.mock('../features/map/render/MapRenderer', () => {
  return {
    MapRenderer: class {
      attach = rendererAttachSpy
      detach = rendererDetachSpy
      render = rendererRenderSpy
      destroy = rendererDestroySpy
    },
  }
})

vi.mock('vue3-pixi', async () => {
  const vue = await import('vue')
  return {
    Application: vue.defineComponent({
      name: 'Application',
      setup(_, { slots }) {
        return () => vue.h('div', { class: 'mock-application' }, slots.default?.())
      },
    }),
    onReady: (callback: (app: { stage: unknown }) => void) => {
      callback({ stage: { addChild: vi.fn(), removeChild: vi.fn() } })
    },
  }
})

describe('map canvas integration', () => {
  let wrapper: VueWrapper
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    rendererRenderSpy.mockClear()
    rendererAttachSpy.mockClear()
    rendererDetachSpy.mockClear()
    rendererDestroySpy.mockClear()

    pinia = createPinia()
    setActivePinia(pinia)
    const store = useMapStore()
    await store.loadMapData()

    const [{ default: MapCanvas }, { default: MapToolbar }] = await Promise.all([
      import('../features/map/MapCanvas.vue'),
      import('../features/map/MapToolbar.vue'),
    ])

    const Host = defineComponent({
      components: { MapCanvas, MapToolbar },
      template: '<div><MapToolbar /><MapCanvas /></div>',
    })

    wrapper = mount(Host, {
      global: {
        plugins: [pinia],
      },
    })

    const mapCanvas = wrapper.find('.map-canvas').element as HTMLElement
    vi.spyOn(mapCanvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 720,
      right: 1280,
      width: 1280,
      height: 720,
      toJSON: () => ({}),
    })
  })

  it('toolbar mode switching drives canvas redraw', async () => {
    const store = useMapStore()
    const initialCalls = rendererRenderSpy.mock.calls.length

    const modeButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'De Facto')
    expect(modeButton).toBeDefined()

    await modeButton!.trigger('click')
    await nextTick()

    expect(store.view.mode).toBe('deFacto')
    expect(rendererRenderSpy.mock.calls.length).toBeGreaterThan(initialCalls)
  })

  it('drag and wheel update viewport and zoom', async () => {
    const store = useMapStore()
    const canvas = wrapper.find('.map-canvas')
    const element = canvas.element as HTMLElement

    element.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100, bubbles: true }),
    )
    element.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 140, clientY: 130, bubbles: true }),
    )
    element.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 140, clientY: 130, bubbles: true }),
    )
    await nextTick()

    expect(store.view.viewportX).toBe(40)
    expect(store.view.viewportY).toBe(30)

    const previousZoom = store.view.zoom
    element.dispatchEvent(new WheelEvent('wheel', { clientX: 200, clientY: 200, deltaY: -150, bubbles: true }))
    await nextTick()
    expect(store.view.zoom).toBeGreaterThan(previousZoom)
  })
})
