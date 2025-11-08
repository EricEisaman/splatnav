import { createApp } from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import './styles/main.css'

const app = createApp(App, undefined, {
  mode: 'vapor'
})
app.use(vuetify)
app.mount('#app')

