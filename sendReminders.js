const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Configuração do Firebase
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  databaseURL: `https://${firebaseConfig.project_id}.firebaseio.com`
});

// Configuração do e-mail (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

async function sendReminders() {
  const now = new Date();
  const timeWindow = 30; // Verifica eventos nos próximos 30 minutos

  try {
    const snapshot = await admin.firestore().collection('events')
      .where('start', '>=', now)
      .where('start', '<=', new Date(now.getTime() + timeWindow * 60000))
      .where('email', '!=', '')
      .where('reminder', '>', 0)
      .get();

    console.log(`Eventos encontrados: ${snapshot.size}`);

    const promises = [];
    snapshot.forEach(doc => {
      const event = doc.data();
      const eventTime = event.start.toDate();
      const minutesDiff = Math.floor((eventTime - now) / 60000);

      // Verifica se está no tempo do lembrete
      if (minutesDiff <= event.reminder && minutesDiff >= 0) {
        promises.push(
          transporter.sendMail({
            from: `KalendarReminder <${process.env.EMAIL_USER}>`,
            to: event.email,
            subject: `⏰ Lembrete: ${event.title}`,
            html: `
              <h2>${event.title}</h2>
              <p><strong>Quando:</strong> ${eventTime.toLocaleString('pt-BR')}</p>
              ${event.comment ? `<p><strong>Detalhes:</strong> ${event.comment}</p>` : ''}
              <p><small>KalendarReminder</small></p>
            `
          })
        );
        console.log(`Lembrete agendado para: ${event.email}`);
      }
    });

    await Promise.all(promises);
    console.log('Todos os e-mails foram enviados!');
  } catch (error) {
    console.error('Erro:', error);
  }
}

sendReminders();