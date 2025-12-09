import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  Car, 
  BarChart3, 
  FileSpreadsheet, 
  Shield, 
  Clock, 
  Zap,
  CheckCircle2,
  Star,
  ChevronRight,
  Play
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Gradient glow background */}
      <div className="fixed inset-0 bg-gradient-glow pointer-events-none" />
      
      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-xl shadow-elegant">
                <Car className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-gradient">
                KM Track
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Inloggen
              </Link>
              <Link to="/auth">
                <Button className="bg-primary hover:bg-primary/90 shadow-elegant">
                  Gratis starten
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <Badge variant="secondary" className="mb-6 px-4 py-2 text-sm font-medium">
                <Zap className="h-4 w-4 mr-2 text-primary" />
                Nieuw: Automatische Tesla sync
              </Badge>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                <span className="text-gradient">Kilometerregistratie</span>
                <br />
                <span className="text-foreground">zonder gedoe</span>
              </h1>
              
              <p className="text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
                Koppel je Tesla en laat de app automatisch je kilometers bijhouden. 
                Perfect voor zakelijk gebruik en belastingaangifte.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                <Link to="/auth">
                  <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 shadow-elegant text-lg px-8">
                    Start gratis
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto group">
                  <Play className="h-5 w-5 mr-2 group-hover:text-primary transition-colors" />
                  Bekijk demo
                </Button>
              </div>

              <div className="flex flex-wrap gap-6 justify-center lg:justify-start text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span>Gratis te gebruiken</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span>Geen creditcard nodig</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <span>Direct beginnen</span>
                </div>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-3xl animate-float" />
              <Card className="relative border-border/40 bg-card/80 backdrop-blur-sm shadow-card overflow-hidden">
                <CardContent className="p-8">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-primary/10 p-3 rounded-xl">
                      <Car className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">Tesla Model 3</p>
                      <p className="text-sm text-muted-foreground">Vandaag gesynchroniseerd</p>
                    </div>
                    <Badge className="ml-auto bg-success/10 text-success border-success/20">
                      Live
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-muted/50 rounded-xl p-4">
                      <p className="text-sm text-muted-foreground mb-1">Deze maand</p>
                      <p className="text-2xl font-bold">1.247 km</p>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-4">
                      <p className="text-sm text-muted-foreground mb-1">Zakelijk</p>
                      <p className="text-2xl font-bold text-success">892 km</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { date: 'Vandaag', km: '45 km', type: 'Zakelijk' },
                      { date: 'Gisteren', km: '28 km', type: 'Privé' },
                      { date: '7 dec', km: '112 km', type: 'Zakelijk' },
                    ].map((trip, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm">{trip.date}</span>
                        <span className="font-medium">{trip.km}</span>
                        <Badge variant={trip.type === 'Zakelijk' ? 'default' : 'secondary'} className="text-xs">
                          {trip.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Floating elements */}
        <div className="absolute top-40 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float pointer-events-none" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float-delayed pointer-events-none" />
      </section>

      {/* How it works */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Hoe het werkt</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              In 3 stappen klaar
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Begin binnen enkele minuten met het automatisch bijhouden van je kilometers.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Account aanmaken',
                description: 'Maak gratis een account aan met je e-mailadres.',
                icon: Shield
              },
              {
                step: '02',
                title: 'Tesla koppelen',
                description: 'Verbind je Tesla account veilig via OAuth.',
                icon: Car
              },
              {
                step: '03',
                title: 'Automatisch tracken',
                description: 'Je kilometers worden dagelijks automatisch gesynchroniseerd.',
                icon: Zap
              }
            ].map((item, index) => (
              <div key={index} className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                <Card className="relative h-full border-border/40 bg-card hover:shadow-card transition-all duration-300">
                  <CardContent className="p-8">
                    <span className="text-6xl font-bold text-primary/10">{item.step}</span>
                    <item.icon className="h-10 w-10 text-primary my-4" />
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
                {index < 2 && (
                  <ChevronRight className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 h-8 w-8 text-primary/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Alles wat je nodig hebt
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Professionele kilometerregistratie met alle functies die je verwacht.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Car,
                title: "Tesla Integratie",
                description: "Directe koppeling met alle Tesla modellen via de officiële API."
              },
              {
                icon: FileSpreadsheet,
                title: "CSV Export",
                description: "Exporteer je data naar CSV voor Excel, Google Sheets of je boekhouder."
              },
              {
                icon: BarChart3,
                title: "Inzichtelijke Statistieken",
                description: "Bekijk trends en patronen in je rijgedrag met duidelijke grafieken."
              },
              {
                icon: Shield,
                title: "GDPR Compliant",
                description: "Je data is veilig en wordt verwerkt volgens Europese privacywetgeving."
              },
              {
                icon: Clock,
                title: "Automatische Sync",
                description: "Dagelijkse automatische synchronisatie, geen handmatig werk nodig."
              },
              {
                icon: Zap,
                title: "Zakelijk/Privé Splitsing",
                description: "Markeer ritten eenvoudig als zakelijk of privé voor je administratie."
              }
            ].map((feature, index) => (
              <Card key={index} className="group border-border/40 bg-card/50 backdrop-blur-sm hover:shadow-card hover:border-primary/20 transition-all duration-300">
                <CardContent className="p-6">
                  <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="secondary" className="mb-4">Reviews</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Wat gebruikers zeggen
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Mark de Vries",
                role: "ZZP'er",
                content: "Eindelijk een app die gewoon werkt. Mijn boekhouder is blij met de CSV exports.",
                rating: 5
              },
              {
                name: "Lisa Jansen",
                role: "Sales Manager",
                content: "Perfect voor het bijhouden van zakelijke kilometers. Bespaart me uren per maand.",
                rating: 5
              },
              {
                name: "Peter van Dam",
                role: "Consultant",
                content: "De automatische Tesla sync is geniaal. Set it and forget it!",
                rating: 5
              }
            ].map((testimonial, index) => (
              <Card key={index} className="border-border/40 bg-card">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-foreground mb-4">"{testimonial.content}"</p>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-accent/5">
            <div className="absolute inset-0 bg-gradient-glow" />
            <CardContent className="relative p-12 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Start vandaag nog
              </h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Maak gratis een account aan en begin direct met het automatisch bijhouden van je kilometers.
              </p>
              <Link to="/auth">
                <Button size="lg" className="bg-primary hover:bg-primary/90 shadow-elegant text-lg px-10">
                  Gratis beginnen
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-12 px-4 sm:px-6 lg:px-8 bg-muted/20">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2 rounded-xl">
                <Car className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-gradient">KM Track</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Voorwaarden</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact</a>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 KM Track. Alle rechten voorbehouden.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
