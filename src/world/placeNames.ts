import type {Landmark} from './schema';
/**
 * Cerea's short place names, as its atlas, directions and façade signs have always shown them. They are
 * keyed by the landmark's full name, so every other place (Verona's churches, the region's towns) shows
 * its own name (#80: every church used to be labelled San Zeno). Kept in code, not in the map, because
 * the save signature covers the whole district file.
 */
const atlas:Record<string,string>={'San Zeno in Santa Maria Assunta':'San Zeno','Scuola Olga Visentini':'Scuola Visentini'};
const directions:Record<string,string>={'San Zeno in Santa Maria Assunta':'San Zeno','Biblioteca di Cerea':'Biblioteca','Municipio di Cerea':'Municipio'};
const signs:Record<string,string[]>={'San Zeno in Santa Maria Assunta':['SAN ZENO'],'Municipio di Cerea':['MUNICIPIO'],'Biblioteca di Cerea':['BIBLIOTECA','DI CEREA'],'Scuola Olga Visentini':['SCUOLA','OLGA VISENTINI'],'Ufficio Postale di Cerea':['POSTE'],'Oratorio dello Spasimo':['ORATORIO','DELLO SPASIMO']};
type Place=Pick<Landmark,'name'>;
export const atlasLabel=(place:Place)=>atlas[place.name]??place.name;
export const directionsName=(place:Place)=>directions[place.name]??place.name;
export const signRows=(place:Place)=>signs[place.name]??(place.name.length>24?place.name.toUpperCase().split(/ (.+)/).filter(Boolean):[place.name.toUpperCase()]);
