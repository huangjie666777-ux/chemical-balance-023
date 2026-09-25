import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

describe('App 工作台', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('点击配平后展示系数与守恒核对', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.get('button.btn-primary').trigger('click');
    await wrapper.vm.$nextTick();
    const eq = wrapper.get('.equation').text();
    expect(eq).toContain('2');
    expect(eq).toContain('H');
    const rows = wrapper.findAll('.check-table tbody tr');
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.text()).toContain('守恒');
    wrapper.unmount();
  });

  it('输入改动后旧结果标记为失效', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.get('button.btn-primary').trigger('click');
    await wrapper.vm.$nextTick();
    const firstInput = wrapper.get('#l-1')
    ;(firstInput.element as HTMLInputElement).value = 'CH4';
    await firstInput.trigger('input');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.stale').exists()).toBe(true);
    expect(wrapper.find('.equation').exists()).toBe(false);
    wrapper.unmount();
  });

  it('解析错误时禁用配平并定位物质', async () => {
    const wrapper = mount(App);
    const input = wrapper.get('#l-1');
    ;(input.element as HTMLInputElement).value = 'H2(X)';
    await input.trigger('input');
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.err').text()).toContain('未知元素');
    expect((wrapper.get('button.btn-primary').element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('离子示例：电子配平且电荷守恒', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    const buttons = wrapper.findAll('.examples .btn-link');
    await buttons[3].trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.get('button.btn-primary').trigger('click');
    await wrapper.vm.$nextTick();
    const labels = wrapper.findAll('.check-table tbody .el-btn').map((b) => b.text());
    expect(labels).toContain('电荷');
    const chargeRow = wrapper.findAll('.check-table tbody tr').find((r) => r.text().includes('电荷'))!;
    expect(chargeRow.text()).toContain('守恒');
    wrapper.unmount();
  });

  it('复制纯文本方程式', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await wrapper.get('button.btn-primary').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.get('.copy-row .btn-link').trigger('click');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('2H2 + O2 -> 2H2O');
    wrapper.unmount();
  });
});
