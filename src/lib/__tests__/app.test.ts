import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../App.vue'

describe('App 工作台', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('载入默认输入并配平，展示系数与守恒表', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.find('.balance-btn').trigger('click')
    await wrapper.vm.$nextTick()
    const eq = wrapper.find('.equation').text()
    expect(eq.replace(/\s+/g, '')).toContain('2H2+O2→2H2O')
    const rows = wrapper.findAll('.check-table tbody tr')
    const texts = rows.map((r) => r.text())
    expect(texts.some((t) => t.includes('H') && t.includes('守恒'))).toBe(true)
    expect(texts.some((t) => t.includes('电荷') && t.includes('守恒'))).toBe(true)
  })

  it('修改输入后旧结果标记失效', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.find('.balance-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.equation').exists()).toBe(true)
    const input = wrapper.find('[data-side="left"] .formula-input')
    await input.setValue('H3')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.banner.warn').exists()).toBe(true)
    expect(wrapper.find('.results').exists()).toBe(false)
  })

  it('解析失败时定位到对应物质并禁用配平', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const input = wrapper.find('[data-side="left"] .formula-input')
    await input.setValue('H(0)')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.row.invalid').exists()).toBe(true)
    expect(wrapper.find('.balance-btn').attributes('disabled')).toBeDefined()
  })

  it('不能全正配平时给出明确原因而非伪造系数', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const leftInputs = wrapper.findAll('[data-side="left"] .formula-input')
    await leftInputs[0].setValue('H2')
    await leftInputs[1].setValue('H2O')
    const rightInputs = wrapper.findAll('[data-side="right"] .formula-input')
    await rightInputs[0].setValue('O2')
    await wrapper.find('.balance-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.banner.bad').text()).toMatch(/无解|零或负系数/)
  })
})
