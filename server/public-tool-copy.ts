export function publicToolCopy(value:string) {
  if(/illegal access\|no appid info|10105|10110/.test(value))return '语音转写暂不可用，请联系管理员检查服务授权。';
  return value.replace(/(?:科大)?讯飞|iflytek/gi,'语音识别服务').replace(/mini?max/gi,'语音生成服务').replace(/speech\s*2\.8/gi,'当前语音模型');
}
