import { createApp } from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import './styles/main.css'

const app = createApp(App)
app.use(vuetify)
app.mount('#app')

